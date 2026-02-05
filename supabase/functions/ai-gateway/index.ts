type Json = Record<string, unknown>;

function corsHeaders(origin: string | null, requestHeaders?: string | null) {
  const o = origin && origin !== "null" ? origin : "*";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": (requestHeaders || "*").trim() || "*",
    "access-control-max-age": "86400",
    "content-type": "application/json; charset=utf-8",
  };
}

function jsonResponse(body: unknown, init?: ResponseInit, origin?: string | null) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(origin ?? null, null),
      ...(init?.headers ?? {}),
    },
  });
}

async function safeJson(req: Request): Promise<Json> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return {};
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as Json) : {};
  } catch {
    return {};
  }
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

function getSubpath(req: Request): string[] {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("ai-gateway");
  if (idx >= 0) return parts.slice(idx + 1);
  return parts.slice(1);
}

function isObject(v: unknown): v is Json {
  return Boolean(v) && typeof v === "object";
}

function toText(v: unknown) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function b64encode(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(text: string) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(secret: string) {
  const raw = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(plain: string, secret: string) {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1:${b64encode(iv)}:${b64encode(new Uint8Array(ct))}`;
}

async function decryptSecret(cipher: string, secret: string) {
  const raw = toText(cipher).trim();
  if (!raw) return "";
  const m = /^v1:([^:]+):(.+)$/.exec(raw);
  if (!m) return "";
  const iv = b64decode(m[1]);
  const data = b64decode(m[2]);
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}

type ConnectorKind = "openai_compat" | "zhipu" | "http";

type ConnectorRow = {
  id: string;
  name: string;
  kind: ConnectorKind;
  base_url: string | null;
  model_default: string | null;
  headers_json: Json | null;
  encrypted_api_key: string | null;
  enabled: boolean;
  updated_at: string;
};

type RouteRow = {
  feature_id: string;
  connector_id: string;
  output_format: string;
  system_prompt: string | null;
  model_override: string | null;
  enabled: boolean;
  updated_at: string;
};

async function supabaseRestFetch(
  serviceRoleKey: string,
  supabaseUrl: string,
  path: string,
  init: RequestInit,
) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function getUserIdFromAccessToken(supabaseUrl: string, anonKey: string, accessToken: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return "";
  const data = (await res.json()) as any;
  return typeof data?.id === "string" ? data.id : "";
}

function parseAdminUids(raw: string) {
  return raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function requireBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1]?.trim() || "";
}

function normalizeBaseUrl(url: string) {
  const t = url.trim();
  return t.replace(/\/+$/, "");
}

async function openaiCompatChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  extraHeaders?: Json | null,
) {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(extraHeaders || {}),
    } as any,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err =
      (data && (data.error?.message || data.error)) ||
      raw ||
      `上游请求失败(${res.status})`;
    throw new Error(toText(err));
  }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("上游返回为空");
  return content.trim();
}

async function zhipuImageGenerate(apiKey: string, prompt: string) {
  const base = "https://open.bigmodel.cn/api/paas/v4";
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ prompt, model: "cogview-3-plus" }),
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(toText(data?.error?.message || raw || `上游请求失败(${res.status})`));
  const url = data?.data?.[0]?.url;
  if (typeof url !== "string" || !url.trim()) throw new Error("图片生成返回为空");
  return url.trim();
}

async function zhipuVideoCreate(apiKey: string, prompt: string, imageUrl?: string) {
  const base = "https://open.bigmodel.cn/api/paas/v4";
  const payload: any = { prompt, model: "cogvideox" };
  if (imageUrl) payload.image_url = imageUrl;
  const res = await fetch(`${base}/videos/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(toText(data?.error?.message || raw || `上游请求失败(${res.status})`));
  const taskId = data?.id || data?.task_id;
  if (typeof taskId !== "string" || !taskId.trim()) throw new Error("视频任务创建返回为空");
  return taskId.trim();
}

async function zhipuVideoQuery(apiKey: string, taskId: string) {
  const base = "https://open.bigmodel.cn/api/paas/v4";
  const res = await fetch(`${base}/async-result/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(toText(data?.error?.message || raw || `上游请求失败(${res.status})`));
  return data;
}

const DEFAULT_FEATURE_PROMPTS: Record<string, string> = {
  "lesson-text":
    "你是一位专业的智慧教学助手。请根据用户输入生成标准教案（教学目标、重难点、教学过程、板书设计、作业设计）。",
  "lesson-graphic":
    "你是一位专业的智慧教学助手。请根据用户输入生成图文教案的文字部分（不需要输出图片链接）。",
  "deepseek-chat":
    "你是一位专业的初中数学老师。请严格遵守以下规则：\n1. 严禁使用星号加粗。\n2. 使用标准层级（一、(一) 1. (1)）。\n3. 在教案结束后使用 --- 分割线。\n4. 首次对话必须先进行时间问候并收集学科、年级等信息。",
  mindmap:
    "请根据主题生成一个层级化思维导图 JSON，严格输出 JSON（不要包含其它说明）。结构：{\"root\":string,\"branches\":[{\"label\":string,\"subItems\":[string]}]}",
  game:
    "你是网页游戏开发助手。请生成可直接运行的单页网页游戏 index.html（包含 CSS 与 JS），尽量不依赖外部 CDN，输出完整 HTML。",
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get("access-control-request-headers");
    return new Response(null, { status: 204, headers: corsHeaders(origin, reqHeaders) });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const encKey = requireEnv("AI_CONFIG_ENC_KEY");
    const adminUids = parseAdminUids(Deno.env.get("ADMIN_UIDS") || "");

    const sub = getSubpath(req);
    const route = (sub[0] || "").toLowerCase();

    const bearer = requireBearer(req);
    if (!bearer) return jsonResponse({ ok: false, error: "未登录或缺少 Authorization" }, { status: 401 }, origin);

    const userId = await getUserIdFromAccessToken(supabaseUrl, anonKey, bearer);
    if (!userId) return jsonResponse({ ok: false, error: "登录态无效，请重新登录" }, { status: 401 }, origin);

    const isAdmin = adminUids.length > 0 ? adminUids.includes(userId) : false;

    if (route === "admin") {
      if (!isAdmin) return jsonResponse({ ok: false, error: "无权限：仅管理员可操作" }, { status: 403 }, origin);
      const action = (sub[1] || "").toLowerCase();

      if (req.method === "GET" && action === "config") {
        const [c, r] = await Promise.all([
          supabaseRestFetch(serviceRoleKey, supabaseUrl, "/rest/v1/ai_connectors?select=*", { method: "GET" }),
          supabaseRestFetch(serviceRoleKey, supabaseUrl, "/rest/v1/ai_feature_routes?select=*", { method: "GET" }),
        ]);
        if (!c.res.ok) return jsonResponse({ ok: false, error: "读取 connectors 失败", detail: c.data }, { status: c.res.status }, origin);
        if (!r.res.ok) return jsonResponse({ ok: false, error: "读取 routes 失败", detail: r.data }, { status: r.res.status }, origin);
        return jsonResponse({ ok: true, connectors: c.data, routes: r.data }, {}, origin);
      }

      if (req.method === "POST" && action === "connectors") {
        const body = await safeJson(req);
        const id = toText(body.id).trim() || crypto.randomUUID();
        const name = toText(body.name).trim();
        const kind = toText(body.kind).trim() as ConnectorKind;
        const baseUrl = toText(body.base_url).trim();
        const modelDefault = toText(body.model_default).trim();
        const enabled = body.enabled !== false;
        const apiKey = toText(body.api_key).trim();
        const headersJson = isObject(body.headers_json) ? body.headers_json : null;
        if (!name) return jsonResponse({ ok: false, error: "缺少 name" }, { status: 400 }, origin);
        if (!kind) return jsonResponse({ ok: false, error: "缺少 kind" }, { status: 400 }, origin);

        const row: any = {
          id,
          name,
          kind,
          base_url: baseUrl || null,
          model_default: modelDefault || null,
          headers_json: headersJson,
          enabled,
          updated_at: new Date().toISOString(),
        };
        if (apiKey) row.encrypted_api_key = await encryptSecret(apiKey, encKey);

        const up = await supabaseRestFetch(
          serviceRoleKey,
          supabaseUrl,
          "/rest/v1/ai_connectors?on_conflict=id",
          {
            method: "POST",
            headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify(row),
          },
        );
        if (!up.res.ok) return jsonResponse({ ok: false, error: "保存 connector 失败", detail: up.data }, { status: up.res.status }, origin);
        return jsonResponse({ ok: true, connector: (up.data as any)?.[0] ?? row }, {}, origin);
      }

      if (req.method === "POST" && action === "routes") {
        const body = await safeJson(req);
        const featureId = toText(body.feature_id).trim();
        const connectorId = toText(body.connector_id).trim();
        const outputFormat = toText(body.output_format).trim();
        const enabled = body.enabled !== false;
        const systemPrompt = toText(body.system_prompt).trim();
        const modelOverride = toText(body.model_override).trim();
        if (!featureId) return jsonResponse({ ok: false, error: "缺少 feature_id" }, { status: 400 }, origin);
        if (!connectorId) return jsonResponse({ ok: false, error: "缺少 connector_id" }, { status: 400 }, origin);
        if (!outputFormat) return jsonResponse({ ok: false, error: "缺少 output_format" }, { status: 400 }, origin);

        const row: any = {
          feature_id: featureId,
          connector_id: connectorId,
          output_format: outputFormat,
          enabled,
          system_prompt: systemPrompt || null,
          model_override: modelOverride || null,
          updated_at: new Date().toISOString(),
        };

        const up = await supabaseRestFetch(
          serviceRoleKey,
          supabaseUrl,
          "/rest/v1/ai_feature_routes?on_conflict=feature_id",
          {
            method: "POST",
            headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify(row),
          },
        );
        if (!up.res.ok) return jsonResponse({ ok: false, error: "保存 route 失败", detail: up.data }, { status: up.res.status }, origin);
        return jsonResponse({ ok: true, route: (up.data as any)?.[0] ?? row }, {}, origin);
      }

      if (req.method === "DELETE" && action === "connectors") {
        const url = new URL(req.url);
        const id = (url.searchParams.get("id") || "").trim();
        if (!id) return jsonResponse({ ok: false, error: "缺少 id" }, { status: 400 }, origin);
        const del = await supabaseRestFetch(serviceRoleKey, supabaseUrl, `/rest/v1/ai_connectors?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!del.res.ok) return jsonResponse({ ok: false, error: "删除 connector 失败", detail: del.data }, { status: del.res.status }, origin);
        return jsonResponse({ ok: true }, {}, origin);
      }

      if (req.method === "DELETE" && action === "routes") {
        const url = new URL(req.url);
        const fid = (url.searchParams.get("feature_id") || "").trim();
        if (!fid) return jsonResponse({ ok: false, error: "缺少 feature_id" }, { status: 400 }, origin);
        const del = await supabaseRestFetch(serviceRoleKey, supabaseUrl, `/rest/v1/ai_feature_routes?feature_id=eq.${encodeURIComponent(fid)}`, { method: "DELETE" });
        if (!del.res.ok) return jsonResponse({ ok: false, error: "删除 route 失败", detail: del.data }, { status: del.res.status }, origin);
        return jsonResponse({ ok: true }, {}, origin);
      }

      return jsonResponse({ ok: false, error: "未知管理员接口" }, { status: 404 }, origin);
    }

    if (req.method !== "POST") return jsonResponse({ ok: false, error: "仅支持 POST /run" }, { status: 405 }, origin);

    if (route !== "run") return jsonResponse({ ok: false, error: "未知接口" }, { status: 404 }, origin);

    const body = await safeJson(req);
    const featureId = toText(body.featureId || body.feature_id).trim();
    const initMode = body.init === true;
    const instruction = toText(body.instruction).trim() || (initMode ? "请执行自动初始化引导。" : "");
    const taskId = toText(body.taskId || body.task_id).trim();
    const materials = Array.isArray(body.materials) ? (body.materials as any[]) : [];

    if (!featureId) return jsonResponse({ ok: false, error: "缺少 featureId" }, { status: 400 }, origin);
    if (!instruction && !taskId) return jsonResponse({ ok: false, error: "缺少 instruction" }, { status: 400 }, origin);

    const routesRes = await supabaseRestFetch(
      serviceRoleKey,
      supabaseUrl,
      `/rest/v1/ai_feature_routes?select=*&feature_id=eq.${encodeURIComponent(featureId)}&limit=1`,
      { method: "GET" },
    );
    if (!routesRes.res.ok) return jsonResponse({ ok: false, error: "读取功能路由失败", detail: routesRes.data }, { status: routesRes.res.status }, origin);
    const routeRow = Array.isArray(routesRes.data) ? (routesRes.data[0] as RouteRow | undefined) : undefined;
    if (!routeRow || !routeRow.enabled) {
      return jsonResponse(
        { ok: false, error: "该功能尚未配置 API 接口，请联系管理员在 AI 接口管理中配置。" },
        { status: 400 },
        origin,
      );
    }

    const connectorRes = await supabaseRestFetch(
      serviceRoleKey,
      supabaseUrl,
      `/rest/v1/ai_connectors?select=*&id=eq.${encodeURIComponent(routeRow.connector_id)}&limit=1`,
      { method: "GET" },
    );
    if (!connectorRes.res.ok) return jsonResponse({ ok: false, error: "读取连接器失败", detail: connectorRes.data }, { status: connectorRes.res.status }, origin);
    const connector = Array.isArray(connectorRes.data) ? (connectorRes.data[0] as ConnectorRow | undefined) : undefined;
    if (!connector || !connector.enabled) {
      return jsonResponse({ ok: false, error: "该功能绑定的 API 连接器不可用" }, { status: 400 }, origin);
    }

    const apiKey = connector.encrypted_api_key ? await decryptSecret(connector.encrypted_api_key, encKey) : "";
    if (!apiKey && connector.kind !== "http") {
      return jsonResponse({ ok: false, error: "该功能绑定的连接器未配置 API Key" }, { status: 400 }, origin);
    }

    const phaseRaw = toText(body.phase).trim().toLowerCase();
    const phase = phaseRaw === "init" || phaseRaw === "doc" ? phaseRaw : "";
    const rawChatMessages = Array.isArray(body.messages) ? (body.messages as any[]) : [];

    const outputFormat = (routeRow.output_format || "").toLowerCase();
    if (connector.kind === "openai_compat") {
      const baseUrl = connector.base_url || "";
      if (!baseUrl) return jsonResponse({ ok: false, error: "连接器缺少 base_url" }, { status: 400 }, origin);
      const model = routeRow.model_override || connector.model_default || "";
      if (!model) return jsonResponse({ ok: false, error: "连接器缺少 model" }, { status: 400 }, origin);

      const pieces: string[] = [];
      if (materials.length) {
        for (const m of materials.slice(0, 8)) {
          if (!m) continue;
          const t = toText(m.type || "").toLowerCase();
          if (t === "text") pieces.push(`材料：${toText(m.value).slice(0, 2000)}`);
          else if (t === "image") pieces.push(`材料（图片）：${toText(m.value).slice(0, 2000)}`);
          else pieces.push(`材料：${toText(m.value).slice(0, 2000)}`);
        }
      }

      const systemPrompt = routeRow.system_prompt || DEFAULT_FEATURE_PROMPTS[featureId] || "";
      const shouldOverrideLessonTrigger =
        phase === "doc" &&
        (featureId === "lesson-text" || featureId === "lesson-graphic-text" || featureId === "lesson-graphic");
      const overridePrompt = shouldOverrideLessonTrigger
        ? "你已经完成自动初始化引导。现在请直接输出教案，不要再输出问候与信息收集清单。请严格按提示词中的【教案正文区】与 --- 后【系统交互区】输出。"
        : "";
      const hasChatContext = rawChatMessages.length > 0;
      const userContentBase = [instruction, ...pieces].filter(Boolean).join("\n\n");
      const normalizedChat = rawChatMessages
        .map((m) => ({
          role: toText((m as any)?.role).trim().toLowerCase(),
          content: toText((m as any)?.content).trim(),
        }))
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
        .slice(-20)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 8000) }));
      const contextSystemPrompt = hasChatContext
        ? "你正在进行多轮对话。必须结合上文对话上下文理解当前用户问题；如果用户追问未重复主题/学科/年级/章节等关键信息，默认沿用上一轮内容，不要擅自切换到其他主题。"
        : "";
      const userContent = hasChatContext ? `请结合上文对话上下文回答。\n\n当前用户问题：\n${userContentBase}` : userContentBase;
      const messages = [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...(overridePrompt ? [{ role: "system", content: overridePrompt }] : []),
        ...(contextSystemPrompt ? [{ role: "system", content: contextSystemPrompt }] : []),
        ...normalizedChat,
        { role: "user", content: userContent },
      ];
      const text = await openaiCompatChat(baseUrl, apiKey, model, messages, connector.headers_json);

      if (outputFormat === "json") {
        try {
          const parsed = JSON.parse(text);
          return jsonResponse({ ok: true, output: parsed, meta: { provider: connector.kind, model } }, {}, origin);
        } catch {
          return jsonResponse({ ok: true, output: text, meta: { provider: connector.kind, model } }, {}, origin);
        }
      }
      return jsonResponse({ ok: true, output: text, meta: { provider: connector.kind, model } }, {}, origin);
    }

    if (connector.kind === "zhipu") {
      if (outputFormat === "image") {
        const prompt = [routeRow.system_prompt || "", instruction].filter(Boolean).join("\n");
        const imageUrl = await zhipuImageGenerate(apiKey, prompt);
        return jsonResponse({ ok: true, output: { image_url: imageUrl }, meta: { provider: connector.kind, model: "cogview-3-plus" } }, {}, origin);
      }
      if (outputFormat === "video") {
        if (taskId) {
          const r = await zhipuVideoQuery(apiKey, taskId);
          return jsonResponse({ ok: true, taskId, output: r, meta: { provider: connector.kind, model: "cogvideox" } }, {}, origin);
        }
        const imageUrl = materials.find((m) => toText(m?.type).toLowerCase() === "image")?.value;
        const prompt = [routeRow.system_prompt || "", instruction].filter(Boolean).join("\n");
        const newTaskId = await zhipuVideoCreate(apiKey, prompt, typeof imageUrl === "string" ? imageUrl : undefined);
        return jsonResponse({ ok: true, taskId: newTaskId, meta: { provider: connector.kind, model: "cogvideox" } }, {}, origin);
      }
      return jsonResponse({ ok: false, error: "该连接器暂不支持此输出格式" }, { status: 400 }, origin);
    }

    return jsonResponse({ ok: false, error: "该连接器类型尚未实现" }, { status: 400 }, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg || "服务异常" }, { status: 500 }, origin);
  }
});
