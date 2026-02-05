type Json = Record<string, unknown>;

function corsHeaders(origin: string | null) {
  const o = origin && origin !== "null" ? origin : "*";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "access-control-max-age": "86400",
    "content-type": "application/json; charset=utf-8",
  };
}

function jsonResponse(body: Json, init?: ResponseInit, origin?: string | null) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(origin ?? null),
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

function getSubpath(req: Request): string[] {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("zhipu-ai-service");
  if (idx >= 0) return parts.slice(idx + 1);
  return parts.slice(1);
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`缺少环境变量 ${name}`);
  return v;
}

async function zhipuFetch(
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: any }> {
  const baseUrl = "https://open.bigmodel.cn/api/paas/v4";
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data };
}

async function deepseekFetch(
  apiKey: string,
  url: string,
  init: RequestInit,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: any }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) return { ok: false, status: res.status, error: data };
  return { ok: true, data };
}

function sanitizeWordText(input: string): string {
  let t = String(input || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/^\s*(?:\*\*+|#+)\s*/gm, "");
  t = t.replace(/^\s*([*•·●▪■◆▶➤]|-|\+)\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/[*`_]/g, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

const TEACHING_ASSISTANT_PROMPT = `# Role / 角色设定
你是一位专业、贴心且严谨的“智慧教学助手”。你的目标是辅助教师高效完成高质量的教学设计与教案编写。

# Rule 1: 启动与问候 (Initial Interaction)
在用户输入任何实质性指令之前，请务必先执行以下初始化行为：

时间感知问候：根据当前系统时间，输出：“尊敬的老师，[早上/中午/下午/晚上]好！”

引导提问：紧接着输出：“请问您今天需要生成什么内容？为了给您提供最精准的教学支持，请告诉我以下信息：
学科：
年级：
教材版本：
对应章节：
具体要求：（例如：侧重深度学习、需要情境导入、包含实验环节等）”

# Rule 2: 内容生成规范 (Content Generation)
当用户提供上述信息后，请按照标准教案格式输出内容，包括但不限于：
教学目标（核心素养视角：知识与技能、过程与方法、情感态度价值观）
教学重难点
教学过程（导入、新授、练习、总结、作业设计）
板书设计

# Rule 3: 自我反思与追问 (Analysis & Follow-up)
在输出完教案内容后，禁止直接结束对话。请自动执行以下步骤：

自我诊断：以【改进建议】为标题，简要分析刚才输出的内容有哪些可以优化的地方（例如：互动环节是否充足、是否契合学情、时间分配是否合理）。

补全追问：询问用户：“老师，针对以上内容，您觉得是否有需要补充或修改的地方？（例如：是否需要增加配套的随堂练习？是否需要针对特定程度的学生调整难度？）”`;

const GAME_CODE_PROMPT = `你是一位专业的网页游戏开发助手。请根据教师/学生给出的需求生成可直接运行的单页网页游戏（index.html），要求：
1) 必须输出完整 HTML（包含 CSS 与 JS），禁止只输出片段。
2) 尽量使用原生 HTML/CSS/JS，不依赖外部 CDN。
3) 在代码顶部给出简短的“使用说明”（如何打开、如何操作），随后给出完整代码。
4) 代码应清晰、可读、结构化（模块化函数/变量命名清晰）。
5) 输出尽量不包含多余解释性长文。`;

function getShanghaiGreeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 11) return "早上";
  if (h >= 11 && h < 13) return "中午";
  if (h >= 13 && h < 18) return "下午";
  return "晚上";
}

function toShanghaiDate(now: Date): Date {
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + 8 * 60 * 60_000);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const url = new URL(req.url);
    const sub = getSubpath(req);
    const route = (sub[0] || "").toLowerCase();

    const zhipuApiKey = Deno.env.get("ZHIPU_API_KEY") || "";
    const deepseekApiKey = Deno.env.get("DEEPSEEK_API_KEY") || "";
    const deepseekBaseUrl = (Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/+$/, "");
    const deepseekModel = (Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat").trim() || "deepseek-chat";

    if (req.method === "GET") {
      if (route !== "video") {
        return jsonResponse(
          { error: "仅支持 GET /video?task_id=xxx 查询视频状态" },
          { status: 400 },
          origin,
        );
      }
      if (!zhipuApiKey) return jsonResponse({ error: "缺少环境变量 ZHIPU_API_KEY" }, { status: 500 }, origin);
      const taskId = url.searchParams.get("task_id")?.trim() || "";
      if (!taskId) {
        return jsonResponse({ error: "缺少 task_id" }, { status: 400 }, origin);
      }
      const r = await zhipuFetch(zhipuApiKey, `/async-result/${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });
      if (!r.ok) {
        return jsonResponse(
          { error: "查询视频状态失败", detail: r.error },
          { status: r.status },
          origin,
        );
      }
      return jsonResponse({ ok: true, task_id: taskId, result: r.data }, {}, origin);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "仅支持 GET/POST/OPTIONS" }, { status: 405 }, origin);
    }

    const body = await safeJson(req);
    const typeFromBody = String(body.type || "").toLowerCase();
    const effectiveRoute = route || typeFromBody;

    if (effectiveRoute === "text") {
      if (!deepseekApiKey) return jsonResponse({ error: "缺少环境变量 DEEPSEEK_API_KEY" }, { status: 500 }, origin);
      const instruction = String(body.instruction ?? body.prompt ?? "").trim();
      if (!instruction) {
        return jsonResponse({ error: "缺少 instruction" }, { status: 400 }, origin);
      }

      const now = toShanghaiDate(new Date());
      const greeting = getShanghaiGreeting(now);
      const systemContext = `当前系统时间（Asia/Shanghai）：${now.toISOString()}\n时间段：${greeting}`;

      const messages = [
        { role: "system", content: `${TEACHING_ASSISTANT_PROMPT}\n\n${systemContext}` },
        { role: "user", content: instruction },
      ];

      const r = await deepseekFetch(deepseekApiKey, `${deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: deepseekModel,
          messages,
          temperature: 0.4,
        }),
      });
      if (!r.ok) {
        return jsonResponse(
          { error: "文本生成失败", detail: r.error },
          { status: r.status },
          origin,
        );
      }
      const content = r.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return jsonResponse({ error: "文本生成返回为空", raw: r.data }, { status: 502 }, origin);
      }
      return jsonResponse(
        {
          ok: true,
          text: content.trim(),
          text_plain: sanitizeWordText(content),
          raw: r.data,
        },
        {},
        origin,
      );
    }

    if (effectiveRoute === "game") {
      if (!deepseekApiKey) return jsonResponse({ error: "缺少环境变量 DEEPSEEK_API_KEY" }, { status: 500 }, origin);
      const instruction = String(body.instruction ?? body.prompt ?? "").trim();
      if (!instruction) {
        return jsonResponse({ error: "缺少 instruction" }, { status: 400 }, origin);
      }
      const messages = [
        { role: "system", content: GAME_CODE_PROMPT },
        { role: "user", content: instruction },
      ];
      const r = await deepseekFetch(deepseekApiKey, `${deepseekBaseUrl}/chat/completions`, {
        method: "POST",
        body: JSON.stringify({
          model: deepseekModel,
          messages,
          temperature: 0.3,
        }),
      });
      if (!r.ok) {
        return jsonResponse(
          { error: "游戏代码生成失败", detail: r.error },
          { status: r.status },
          origin,
        );
      }
      const content = r.data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return jsonResponse({ error: "游戏代码生成返回为空", raw: r.data }, { status: 502 }, origin);
      }
      return jsonResponse(
        {
          ok: true,
          html: content.trim(),
          raw: r.data,
        },
        {},
        origin,
      );
    }

    if (effectiveRoute === "image") {
      if (!zhipuApiKey) return jsonResponse({ error: "缺少环境变量 ZHIPU_API_KEY" }, { status: 500 }, origin);
      const prompt = String(body.prompt ?? body.riddle ?? "").trim();
      if (!prompt) return jsonResponse({ error: "缺少 prompt" }, { status: 400 }, origin);
      const fullPrompt =
        `请生成一张用于数学课堂的“谜语图”，画面清晰、主体突出，含数学元素但不要出现水印。题面：${prompt}`;
      const r = await zhipuFetch(zhipuApiKey, "/images/generations", {
        method: "POST",
        body: JSON.stringify({
          model: "cogview-3-plus",
          prompt: fullPrompt,
          size: "1024x1024",
        }),
      });
      if (!r.ok) {
        return jsonResponse(
          { error: "图片生成失败", detail: r.error },
          { status: r.status },
          origin,
        );
      }
      const data = r.data?.data;
      const firstUrl = Array.isArray(data) ? data?.[0]?.url : null;
      return jsonResponse({ ok: true, image_url: firstUrl, raw: r.data }, {}, origin);
    }

    if (effectiveRoute === "video") {
      if (!zhipuApiKey) return jsonResponse({ error: "缺少环境变量 ZHIPU_API_KEY" }, { status: 500 }, origin);
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) return jsonResponse({ error: "缺少 prompt" }, { status: 400 }, origin);
      const r = await zhipuFetch(zhipuApiKey, "/videos/generations", {
        method: "POST",
        body: JSON.stringify({
          model: "cogvideox",
          prompt,
          quality: body.quality ?? "quality",
          with_audio: Boolean(body.with_audio ?? false),
          size: body.size ?? "1920x1080",
          fps: body.fps ?? 30,
        }),
      });
      if (!r.ok) {
        return jsonResponse(
          { error: "视频任务创建失败", detail: r.error },
          { status: r.status },
          origin,
        );
      }
      const taskId = r.data?.id ?? r.data?.task_id ?? r.data?.taskId;
      if (!taskId) {
        return jsonResponse({ error: "视频任务未返回 task_id", raw: r.data }, { status: 502 }, origin);
      }
      return jsonResponse({ ok: true, task_id: taskId, raw: r.data }, {}, origin);
    }

    return jsonResponse(
      { error: "未知路由", hint: "POST /text | /game | /image | /video，GET /video?task_id=xxx" },
      { status: 404 },
      origin,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: msg }, { status: 500 }, origin);
  }
});
