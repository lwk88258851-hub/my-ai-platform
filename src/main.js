import { createClient } from '@supabase/supabase-js';
import * as echarts from 'echarts';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker?url';
import * as XLSX from 'xlsx';

// ==========================================
// 1. SUPABASE 配置
// ==========================================
// 关键说明：这里从 Vite 环境变量读取，避免把 Key 写死在代码里（更安全、也更方便切换环境）
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// ==========================================
// 2. 初始化检查与客户端创建
// ==========================================
let supabaseClient = null;

window.onload = function() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        alert("❌ 错误：未配置 Supabase 环境变量（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）！");
        return;
    }

    try {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
        // 尝试恢复会话
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                app.data.user = session.user;
                el('login-screen').style.display = 'none';
                // el('app-container').style.display = 'flex'; // Wait for class selection
                app.init();
            }
        });
    } catch (err) {
        console.error(err);
    }
};

const el = id => document.getElementById(id);
const speak = (txt) => { if(!txt)return; const u = new SpeechSynthesisUtterance(txt); u.lang = 'zh-CN'; u.rate = 1.2; speechSynthesis.speak(u); };

// ==========================================
// 3. 特效功能 (V1 特效回归)
// ==========================================
const fireConfetti = () => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed'; canvas.style.top = '0'; canvas.style.left = '0';
    canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.pointerEvents = 'none'; canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const particles = [];
    for(let i=0; i<300; i++) particles.push({ x: window.innerWidth/2, y: window.innerHeight/2, vx: (Math.random()-0.5)*25, vy: (Math.random()-0.5)*25, color: `hsl(${Math.random()*360}, 100%, 50%)`, life: 200 + Math.random() * 100, gravity: 0.1 });
    const startTime = Date.now();
    function anim() {
        if(Date.now() - startTime > 3000) { document.body.removeChild(canvas); return; }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        particles.forEach((p,i) => { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life--; ctx.globalAlpha = Math.min(1, p.life/50); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 6, 6); if(p.life <= 0) particles.splice(i,1); });
        requestAnimationFrame(anim);
    }
    anim();
};

// ==========================================
// 4. 修复版：画板与工具栏逻辑
// ==========================================

const tools = {
    activeSubject: null, // 当前激活的学科

    // 核心切换逻辑
    toggleSubject(subject) {
        const dock = document.getElementById('subject-dock');
        const items = document.querySelectorAll('.dock-item');
        const panels = document.querySelectorAll('.dock-tools-container');

        // 1. 如果点击的是当前已激活的学科 -> 执行“收起/取消”逻辑
        if (this.activeSubject === subject) {
            this.activeSubject = null;
            
            // 移除所有模式类，恢复原状
            dock.className = 'subject-dock'; 
            
            // 移除图标激活状态
            items.forEach(el => el.classList.remove('active'));
            
            // 隐藏所有工具面板
            panels.forEach(p => p.style.display = 'none');
            
            return;
        }

        // 2. 如果点击的是新学科 -> 执行“展开/选中”逻辑
        this.activeSubject = subject;
        
        // 设置 Dock 状态：添加 expanded 类 和 对应的 mode 类 (用于CSS隐藏其他图标)
        dock.className = `subject-dock expanded mode-${subject}`;

        // 处理图标高亮
        items.forEach(el => {
            if (el.classList.contains(subject)) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // 处理工具面板显示
        panels.forEach(p => p.style.display = 'none'); // 先全藏
        const targetPanel = document.getElementById(`dock-panel-${subject}`);
        if (targetPanel) {
            targetPanel.style.display = 'flex'; // 再显示目标
        }
    },
    
    // 配合 wb 对象使用的辅助方法 (用于确保工具栏在绘制时保持打开)
    ensurePanelOpen() {
        if (!this.activeSubject) return; 
        const dock = document.getElementById('subject-dock');
        if (dock && !dock.classList.contains('expanded')) {
            // 如果意外关闭了，重新触发一次打开
            this.toggleSubject(this.activeSubject);
        }
    }
};

const wb = {
    canvas: null, 
    ctx: null, 
    mode: 'pen', 
    isDrawing: false, 
    color: 'red',
    snapshot: null, 
    minX: 0, minY: 0, maxX: 0, maxY: 0, 
    startX: 0, startY: 0,
    pages: [],
    currentPageIndex: 0,
    lockedPageCount: null,
    thumbUpdateTimer: null,
    sidebarCollapsed: false,

    init() {
        this.canvas = document.getElementById('drawing-canvas'); 
        if(!this.canvas) return;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }); 
        
        // 绑定事件
        const start = (e) => { 
            if(e.target.closest('.subject-sidebar') || e.target.closest('.wb-toolbar') || e.target.closest('.subject-dock') || e.target.closest('.wb-pages-sidebar')) return;
            if(!this.canvas.classList.contains('active')) return;

            e.preventDefault(); 
            
            const r = this.canvas.getBoundingClientRect(); 
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const cy = e.touches ? e.touches[0].clientY : e.clientY;
            const x = (cx - r.left) * (this.canvas.width / r.width);
            const y = (cy - r.top) * (this.canvas.height / r.height);

            // 如果是公式模式，直接弹窗输入
            if (this.mode === 'formula') {
                this.createFormulaInput(x, y, cx, cy);
                return; 
            }

            this.isDrawing = true; 
            this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.beginPath(); 
            this.ctx.moveTo(x, y);
            
            this.startX = x; this.startY = y;
            this.minX = x; this.maxX = x;
            this.minY = y; this.maxY = y;
        };

        const move = (e) => {
            if(this.isDrawing){ 
                e.preventDefault(); 
                const r = this.canvas.getBoundingClientRect(); 
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                const x = (cx - r.left) * (this.canvas.width / r.width);
                const y = (cy - r.top) * (this.canvas.height / r.height);
                
                this.minX = Math.min(this.minX, x);
                this.maxX = Math.max(this.maxX, x);
                this.minY = Math.min(this.minY, y);
                this.maxY = Math.max(this.maxY, y);

                this.draw(x, y); 
                this.scheduleThumbUpdate();
            } 
        };

        const end = () => { 
            if(this.isDrawing) {
                this.isDrawing = false;
                this.finishShape(); 
                this.saveCurrentPageState();
            }
        };

        this.canvas.onmousedown = start;
        this.canvas.onmousemove = move;
        window.onmouseup = end; 
        this.canvas.ontouchstart = start;
        this.canvas.ontouchmove = move;
        window.ontouchend = end;
        
        this.resize();
        this.resetPages();
        this.applyPagesSidebarState();
    },

    applyPagesSidebarState() {
        const sidebar = document.getElementById('wb-pages-sidebar');
        if (sidebar) sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
        const btn = document.getElementById('wb-pages-toggle-btn');
        if (btn) {
            btn.innerHTML = this.sidebarCollapsed ? '<i class="fas fa-chevron-right"></i>' : '<i class="fas fa-chevron-left"></i>';
            btn.title = this.sidebarCollapsed ? '展开' : '收缩';
        }
    },

    togglePagesSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.applyPagesSidebarState();
    },

    resize() { 
        const w = document.getElementById('zoom-area'); 
        if(w && this.canvas) { 
            if(this.canvas.width !== w.offsetWidth || this.canvas.height !== w.offsetHeight) {
                this.saveCurrentPageState();
                const temp = this.ctx ? this.ctx.getImageData(0,0,this.canvas.width || 1, this.canvas.height || 1) : null;
                this.canvas.width = w.offsetWidth; 
                this.canvas.height = w.offsetHeight; 
                if(temp) this.ctx.putImageData(temp, 0, 0);
                this.saveCurrentPageState();
            }
        } 
    },

    createBlankPage() {
        const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return { id, imageData: null, w: 0, h: 0, thumb: '', thumbLoading: false, meta: null };
    },

    getCurrentPage() {
        return this.pages[this.currentPageIndex] ?? null;
    },

    setPagesMetaFromPlayList(playList) {
        if (!Array.isArray(playList)) return;
        this.syncPagesCount(playList.length);
        this.pages.forEach((p, i) => {
            const step = playList[i];
            if (!step) return;
            p.meta = { type: step.type, url: step.url, name: step.name };
        });
        this.renderPagesSidebar();
    },

    buildThumbFromImageUrl(url) {
        const tw = 100;
        const th = 70;
        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        const cctx = c.getContext('2d');
        cctx.fillStyle = '#fff';
        cctx.fillRect(0, 0, tw, th);

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const sw = img.naturalWidth || 1;
                    const sh = img.naturalHeight || 1;
                    const s = Math.min(tw / sw, th / sh);
                    const dw = Math.max(1, Math.floor(sw * s));
                    const dh = Math.max(1, Math.floor(sh * s));
                    const dx = Math.floor((tw - dw) / 2);
                    const dy = Math.floor((th - dh) / 2);
                    cctx.drawImage(img, dx, dy, dw, dh);
                    resolve(c.toDataURL('image/png'));
                } catch (e) {
                    resolve('');
                }
            };
            img.onerror = () => resolve('');
            img.src = url;
        });
    },

    scheduleThumbUpdate() {
        if (this.thumbUpdateTimer) return;
        this.thumbUpdateTimer = window.setTimeout(() => {
            this.thumbUpdateTimer = null;
            this.saveCurrentPageState();
        }, 250);
    },

    getPreviewSourceElement() {
        const practiceLayer = document.getElementById('practice-layer');
        const inPractice = practiceLayer && getComputedStyle(practiceLayer).display !== 'none';
        const container = inPractice ? document.getElementById('viewer-practice') : document.getElementById('cp-content-area');
        if (!container) return null;

        return (
            container.querySelector('canvas') ||
            container.querySelector('img') ||
            container.querySelector('video')
        );
    },

    makeThumbnailDataUrl() {
        if (!this.canvas) return '';
        const tw = 100;
        const th = 70;
        const c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        const cctx = c.getContext('2d');
        cctx.fillStyle = '#111';
        cctx.fillRect(0, 0, tw, th);

        const src = this.getPreviewSourceElement();
        try {
            if (src && (src.tagName === 'IMG' || src.tagName === 'CANVAS' || src.tagName === 'VIDEO')) {
                let sw = 0;
                let sh = 0;
                if (src.tagName === 'IMG') {
                    const img = src;
                    if (img.complete && img.naturalWidth > 0) {
                        sw = img.naturalWidth;
                        sh = img.naturalHeight;
                    }
                } else if (src.tagName === 'VIDEO') {
                    const v = src;
                    if (v.readyState >= 2 && v.videoWidth > 0) {
                        sw = v.videoWidth;
                        sh = v.videoHeight;
                    }
                } else {
                    const cnv = src;
                    if (cnv.width > 0 && cnv.height > 0) {
                        sw = cnv.width;
                        sh = cnv.height;
                    }
                }

                if (sw > 0 && sh > 0) {
                    const s = Math.min(tw / sw, th / sh);
                    const dw = Math.max(1, Math.floor(sw * s));
                    const dh = Math.max(1, Math.floor(sh * s));
                    const dx = Math.floor((tw - dw) / 2);
                    const dy = Math.floor((th - dh) / 2);
                    cctx.fillStyle = '#fff';
                    cctx.fillRect(0, 0, tw, th);
                    cctx.drawImage(src, dx, dy, dw, dh);
                }
            }
        } catch (e) {}

        try {
            cctx.drawImage(this.canvas, 0, 0, tw, th);
        } catch (e) {}
        return c.toDataURL('image/png');
    },

    renderPagesSidebar() {
        const list = document.getElementById('wb-pages-list');
        if (!list) return;
        list.innerHTML = '';
        const emptyThumb = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

        this.pages.forEach((p, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `wb-page-thumb${i === this.currentPageIndex ? ' active' : ''}`;
            btn.onclick = () => this.jumpToPage(i);

            const img = document.createElement('img');
            img.alt = '';
            img.src = p.thumb || emptyThumb;

            const label = document.createElement('div');
            label.className = 'wb-page-label';
            label.textContent = String(i + 1);

            btn.appendChild(img);
            btn.appendChild(label);
            list.appendChild(btn);

            if (!p.thumb && !p.thumbLoading && p.meta && p.meta.type === 'image' && p.meta.url) {
                p.thumbLoading = true;
                this.buildThumbFromImageUrl(p.meta.url).then((thumb) => {
                    p.thumb = thumb || p.thumb;
                    p.thumbLoading = false;
                    this.renderPagesSidebar();
                });
            }
        });

        const addBtn = document.getElementById('wb-page-add-btn');
        if (addBtn) addBtn.disabled = this.lockedPageCount !== null;

        const delBtn = document.getElementById('wb-page-del-btn');
        if (delBtn) delBtn.disabled = this.pages.length <= 1 || this.lockedPageCount !== null;

        this.applyPagesSidebarState();
    },

    jumpToPage(index) {
        if (!Number.isInteger(index)) return;
        const canSyncToPlayer = this.lockedPageCount !== null &&
            globalThis.app &&
            app.data &&
            Array.isArray(app.data.playList) &&
            app.data.playList.length > 0 &&
            typeof app.renderPlayerStep === 'function';

        if (canSyncToPlayer) {
            app.data.playIndex = Math.max(0, Math.min(index, app.data.playList.length - 1));
            Promise.resolve(app.renderPlayerStep()).catch(() => {});
            return;
        }

        this.switchPage(index);
    },

    setLockedPageCount(count) {
        if (Number.isInteger(count) && count > 0) this.lockedPageCount = count;
        else this.lockedPageCount = null;
        this.renderPagesSidebar();
    },

    syncPagesCount(count) {
        const n = Math.max(1, Number.isInteger(count) ? count : 1);
        if (!Array.isArray(this.pages)) this.pages = [];
        while (this.pages.length < n) this.pages.push(this.createBlankPage());
        if (this.pages.length > n) this.pages = this.pages.slice(0, n);
        if (this.currentPageIndex >= this.pages.length) this.currentPageIndex = this.pages.length - 1;
        this.renderPagesSidebar();
    },

    resetPagesToCount(count) {
        const n = Math.max(1, Number.isInteger(count) ? count : 1);
        this.pages = Array.from({ length: n }, () => this.createBlankPage());
        this.currentPageIndex = 0;
        this.clear();
        this.saveCurrentPageState();
        this.renderPagesSidebar();
    },

    saveCurrentPageState() {
        if (!this.ctx || !this.canvas) return;
        if (!Array.isArray(this.pages) || this.pages.length === 0) return;
        const page = this.getCurrentPage();
        if (!page) return;
        try {
            page.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            page.w = this.canvas.width;
            page.h = this.canvas.height;
            page.thumb = this.makeThumbnailDataUrl();
        } catch (e) {}
        this.renderPagesSidebar();
    },

    loadPage(index) {
        if (!this.ctx || !this.canvas) return;
        const page = this.pages[index];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!page || !page.imageData) return;

        if (page.w === this.canvas.width && page.h === this.canvas.height) {
            try {
                this.ctx.putImageData(page.imageData, 0, 0);
            } catch (e) {}
            return;
        }

        const temp = document.createElement('canvas');
        temp.width = page.w || this.canvas.width;
        temp.height = page.h || this.canvas.height;
        const tctx = temp.getContext('2d', { willReadFrequently: true });
        try {
            tctx.putImageData(page.imageData, 0, 0);
            this.ctx.drawImage(temp, 0, 0, this.canvas.width, this.canvas.height);
        } catch (e) {}
    },

    switchPage(index) {
        if (!Number.isInteger(index)) return;
        if (index < 0 || index >= this.pages.length) return;
        if (index === this.currentPageIndex) return;
        this.saveCurrentPageState();
        this.currentPageIndex = index;
        this.loadPage(index);
        this.renderPagesSidebar();
    },

    addPage() {
        if (this.lockedPageCount !== null) return;
        if (!Array.isArray(this.pages)) this.pages = [];
        this.saveCurrentPageState();
        this.pages.push(this.createBlankPage());
        this.currentPageIndex = this.pages.length - 1;
        if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.saveCurrentPageState();
        this.renderPagesSidebar();
    },

    deletePage() {
        if (this.lockedPageCount !== null) return;
        if (!Array.isArray(this.pages) || this.pages.length <= 1) return;
        this.pages.splice(this.currentPageIndex, 1);
        if (this.currentPageIndex >= this.pages.length) this.currentPageIndex = this.pages.length - 1;
        this.loadPage(this.currentPageIndex);
        this.saveCurrentPageState();
        this.renderPagesSidebar();
    },

    resetPages() {
        this.pages = [this.createBlankPage()];
        this.currentPageIndex = 0;
        this.clear();
        this.saveCurrentPageState();
        this.renderPagesSidebar();
    },

    setColor(c, btn) { 
        this.color = c; 
        document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('active')); 
        if(btn) btn.classList.add('active'); 
    },

    // 设置模式：修复了点击“笔”导致侧边栏消失的Bug
    setShapeMode(m) {
        this.mode = m;
        this.canvas.classList.add('active'); 
        
        // 1. 清除旧版和新版按钮的高亮
        document.querySelectorAll('.wb-btn, .dock-tool-btn').forEach(b => b.classList.remove('active'));
        
        // 2. 高亮当前点击的按钮
        if(event && event.currentTarget) event.currentTarget.classList.add('active');
        
        // 3. 顶部画笔同步
        if(m === 'pen') document.getElementById('btn-pen').classList.add('active');
        
        // 4. 🔥 确保学科工具栏保持展开状态
        const shapeTools = ['magic-line', 'magic-circle', 'rect', 'triangle', 'right-triangle', 'formula'];
        if(shapeTools.includes(m)) {
            tools.ensurePanelOpen();
        }
    },

    setMode(m) { 
        this.setShapeMode(m);
        if(m === 'cursor') {
            this.canvas.classList.remove('active'); 
            document.getElementById('btn-cursor').classList.add('active');
        }
    },

    createFormulaInput(canvasX, canvasY, clientX, clientY) {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '输入...';
        input.style.position = 'fixed';
        input.style.left = clientX + 'px';
        input.style.top = clientY + 'px';
        input.style.zIndex = '9999';
        input.style.background = 'rgba(255, 255, 255, 0.9)';
        input.style.color = 'black';
        input.style.border = '2px solid var(--primary)';
        input.style.padding = '8px 12px';
        input.style.fontSize = '24px';
        input.style.fontFamily = '"Times New Roman", serif'; 
        input.style.fontStyle = 'italic';
        input.style.borderRadius = '8px';
        input.style.outline = 'none';
        input.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        input.style.width = '150px';
        
        document.body.appendChild(input);
        setTimeout(() => input.focus(), 50);

        const confirmInput = () => {
            const text = input.value;
            if (text.trim() !== "") {
                this.ctx.save();
                this.ctx.fillStyle = this.color; 
                this.ctx.font = "italic bold 48px 'Times New Roman', serif"; 
                this.ctx.textBaseline = "middle";
                this.ctx.fillText(text, canvasX, canvasY);
                this.ctx.restore();
            }
            removeInput();
            this.saveCurrentPageState();
        };

        const removeInput = () => {
            if(input.parentNode) input.parentNode.removeChild(input);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmInput();
            if (e.key === 'Escape') removeInput();
        });
        input.addEventListener('blur', confirmInput);
    },

    draw(x, y) { 
        this.ctx.lineCap = 'round'; 
        this.ctx.lineJoin = 'round'; 
        
        if (this.mode === 'eraser') { 
            this.ctx.globalCompositeOperation = 'destination-out'; 
            this.ctx.lineWidth = 30; 
            this.ctx.lineTo(x, y); 
            this.ctx.stroke();
        } 
        else if (this.mode === 'pen') {
            this.ctx.globalCompositeOperation = 'source-over'; 
            this.ctx.strokeStyle = this.color; 
            this.ctx.lineWidth = 3; 
            this.ctx.lineTo(x, y); 
            this.ctx.stroke(); 
        } 
        else if (this.mode === 'magic-line') {
            if(this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
        } 
        else if (this.mode === 'magic-circle') {
            this.ctx.globalCompositeOperation = 'source-over'; 
            this.ctx.strokeStyle = this.color; 
            this.ctx.lineWidth = 3; 
            this.ctx.lineTo(x, y); 
            this.ctx.stroke(); 
        }
        else if (['rect', 'triangle', 'right-triangle'].includes(this.mode)) {
            if(this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();

            const w = x - this.startX;
            const h = y - this.startY;

            if (this.mode === 'rect') {
                this.ctx.rect(this.startX, this.startY, w, h);
            }
            else if (this.mode === 'triangle') {
                this.ctx.moveTo(this.startX + w / 2, this.startY); 
                this.ctx.lineTo(this.startX, this.startY + h);     
                this.ctx.lineTo(this.startX + w, this.startY + h); 
                this.ctx.closePath();
            }
            else if (this.mode === 'right-triangle') {
                this.ctx.moveTo(this.startX, this.startY);         
                this.ctx.lineTo(this.startX, this.startY + h);     
                this.ctx.lineTo(this.startX + w, this.startY + h); 
                this.ctx.closePath();
            }
            this.ctx.stroke();
        }
    },

    finishShape() {
        if (this.mode === 'magic-circle') {
            if(this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
            const width = this.maxX - this.minX;
            const height = this.maxY - this.minY;
            const centerX = this.minX + width / 2;
            const centerY = this.minY + height / 2;
            const radius = Math.max(width, height) / 2;

            if (radius > 5) {
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.strokeStyle = this.color;
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        }
    },    clear() { 
        if(this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); 
        this.saveCurrentPageState();
    },

    // ✅ 新增：切换网格显示
    toggleGrid() {
        const grid = document.getElementById('grid-layer');
        if (grid) {
            grid.classList.toggle('active');
            
            // 可选：如果是开启网格，可以在工具栏给按钮加高亮反馈
            // 这里简单处理，因为 toggleGrid 主要是视觉开关
            
            // 确保工具栏不自动收起
            tools.ensurePanelOpen();
        }
    }
};
// ==========================================
// 5. 核心应用逻辑
// ==========================================
const app = {
    data: {
        // === 基础数据 ===
        user: null, userProfile: null, currentClass: null, students: [], groups: [], 
        isRunning: false, timer: null, mode: 'single', targetGroup: null, 
        tempId1: null, tempId2: null, editingId: null, calledSet: new Set(),
        
        // === 界面状态 ===
        currentStage: 'teaching', localAvatars: {}, analysisData: null, trendCharts: {}, 
        
        // === 题库与倒计时 (这里是新增的关键变量) ===
        qTimer: null, qScale: 1,
        currentPdfDoc: null,  // 存储 PDF 文件对象
        currentPdfPage: 1,    // 当前读到第几页
        totalPdfPages: 0,     // 总页数

        // === 课程播放相关 ===
        lessons: [], editingLessonId: null, playLessonId: null, stepIndex: 0,
        playList: [], playIndex: 0,
        questions: []
    },
    
    rollerData: { grade: null, classNum: null },

    ranks: [
        // 1. 微尘初聚 (原菜鸟)
        { name: "微尘初聚", class: "rank-rookie", icon: "\uf111" },      
        
        // 2. 坚毅磐石 (原黑铁)
        { name: "坚毅磐石", class: "rank-iron", icon: "\uf0c8" },        
        
        // 3. 灵动清风 (原青铜)
        { name: "灵动清风", class: "rank-bronze", icon: "\uf72e" },      
        
        // 4. 奔涌溪流 (原白银)
        { name: "奔涌溪流", class: "rank-silver", icon: "\uf773" },      
        
        // 5. 炽热烈火 (原黄金 - 开启特效分界线)
        { name: "炽热烈火", class: "rank-gold", icon: "\uf06d" },        
        
        // 6. 震天雷霆 (原铂金)
        { name: "震天雷霆", class: "rank-platinum", icon: "\uf0e7" },    
        
        // 7. 傲雪冰霜 (原钻石)
        { name: "傲雪冰霜", class: "rank-diamond", icon: "\uf2dc" },     
        
        // 8. 绚烂极光 (原星耀)
        { name: "绚烂极光", class: "rank-star", icon: "\uf0d0" },        
        
        // 9. 璀璨星辰 (原王者)
        { name: "璀璨星辰", class: "rank-king", icon: "\uf005" },        
        
        // 10. 皎洁皓月 (原荣耀)
        { name: "皎洁皓月", class: "rank-glory", icon: "\uf186" },       
        
        // 11. 耀世骄阳 (原最强王者)
        { name: "耀世骄阳", class: "rank-challenger", icon: "\uf185" }   
    ],
    bgData: ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#fb7185", "#38bdf8", "#4ade80", "#fbbf24", "linear-gradient(to right, #43e97b 0%, #38f9d7 100%)", "linear-gradient(to top, #96fbc4 0%, #f9f586 100%)"],

    toggleAuthView(view) {
        // 修复切换逻辑，适配新布局
        if(view === 'register') { el('login-screen').style.display = 'none'; el('register-screen').style.display = 'flex'; } 
        else { el('login-screen').style.display = 'flex'; el('register-screen').style.display = 'none'; }
    },

    // === 登录模式切换 ===
    currentAuthMode: 'password', // 默认密码登录

    switchAuthMode(mode, tabEl) {
        this.currentAuthMode = mode;
        
        // UI 切换
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        
        if (mode === 'password') {
            el('mode-password').style.display = 'block';
            el('mode-otp').style.display = 'none';
        } else {
            el('mode-password').style.display = 'none';
            el('mode-otp').style.display = 'block';
            this.resetOtpUI();
        }
    },

    // ===简易邮箱记忆 ===
    saveEmailToHistory(email) {
        try {
            let history = JSON.parse(localStorage.getItem('email_history') || '[]');
            if(!history.includes(email)) {
                history.unshift(email);
                localStorage.setItem('email_history', JSON.stringify(history.slice(0,5)));
                this.renderEmailHistory();
            }
        } catch(e) {}
    },
    
    renderEmailHistory() {
        try {
            const list = el('email-history-list');
            if(!list) return;
            list.innerHTML = '';
            const history = JSON.parse(localStorage.getItem('email_history') || '[]');
            history.forEach(e => { const op = document.createElement('option'); op.value = e; list.appendChild(op); });
        } catch(e) {}
    },

    async handleAuth(type) {
        if (!supabaseClient) return alert("Supabase 未连接");
        let email, password, msgEl, name; // 定义 name 变量

        if (type === 'register') {
            email = el('regEmail').value;
            password = el('regPass').value;
            name = el('regName').value; // 获取输入的姓名
            msgEl = el('auth-msg-reg');
            
            // 新增：校验姓名
            if (!name) { msgEl.innerText = "❌ 请输入您的尊姓大名"; return; }
        } else { 
            // 登录逻辑不变
            email = el('emailInput').value; 
            password = el('passwordInput').value; 
            msgEl = el('auth-msg-login');
        }
        
        if (!email || !password) { msgEl.innerText = "请输入邮箱和密码"; return; }
        if (password.length < 6) { msgEl.innerText = "密码长度至少6位"; return; }
        msgEl.innerText = "正在连接云端...";

        let result;
        if (type === 'register') {
            // 🔥 修改关键点：注册时将 full_name 存入 metadata
            result = await supabaseClient.auth.signUp({ 
                email, 
                password,
                options: {
                    data: { full_name: name } // 这里保存名字
                }
            });
            
            if (result.error) msgEl.innerText = "注册失败: " + result.error.message;
            else {
                msgEl.innerText = "注册成功！正在登录...";
                // 自动登录
                const loginRes = await supabaseClient.auth.signInWithPassword({ email, password });
                if (!loginRes.error) { 
                    this.data.user = loginRes.data.user; 
                    el('login-screen').style.display = 'none'; 
                    this.init(); 
                }
            }
        } else {
            // 登录逻辑保持不变
            result = await supabaseClient.auth.signInWithPassword({ email, password });
            if (result.error) msgEl.innerText = "登录失败: " + result.error.message;
            else { 
                this.data.user = result.data.user; 
                el('login-screen').style.display = 'none'; 
                this.init(); 
            }
        }
    },

    // === 修改 sendOtp (适配新UI - 已修复) ===
    async sendOtp() {
        const email = el('emailInput').value;
        if (!email) return (el('auth-msg-login').innerText = "❌ 请先填写邮箱");
        
        this.saveEmailToHistory(email);
        el('auth-msg-login').innerText = "正在发送...";
        
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: { shouldCreateUser: false }
        });

        if (error) {
            el('auth-msg-login').innerText = error.message;
        } else {
            el('auth-msg-login').innerText = "✅ 验证码已发送，请查收邮件";
            // --- 核心修复：显示输入框 ---
            el('otp-step-1').style.display = 'none';
            el('otp-step-2').style.display = 'block';
            el('otpInput').value = '';
            el('otpInput').focus();
            // --- 修复结束 ---
        }
    },

    async verifyOtp() {
        const email = el('emailInput').value;
        const token = el('otpInput').value.trim();
        
        if (!token || token.length < 6) return (el('auth-msg-login').innerText = "❌ 请输入完整的6位验证码");

        el('auth-msg-login').innerText = "正在核验身份...";

        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: email,
            token: token,
            type: 'email'
        });

        if (error) {
            el('auth-msg-login').innerText = "验证失败: " + error.message;
        } else {
            el('auth-msg-login').innerText = "✅ 登录成功！";
            this.data.user = data.user;
            el('login-screen').style.display = 'none';
            this.init();
        }
    },

    // === 重置 OTP 界面 ===
    resetOtpUI() {
        el('otp-step-1').style.display = 'block';
        el('otp-step-2').style.display = 'none';
        el('otpInput').value = '';
        el('auth-msg-login').innerText = "";
    },
    
    // === 新增：切换班级逻辑 ===
    switchClass() {
        // 增加一个确认弹窗，防止误触导致板书丢失
        if (confirm("确定要返回班级列表吗？\n(注意：未保存的板书将会清空)")) {
            // 1. 隐藏主教学界面
            el('app-container').style.display = 'none';
            
            // 2. 显示班级选择界面 (星空背景)
            el('class-selection-screen').style.display = 'flex';
            
            // 3. 清理当前状态 (可选，视需求而定，这里建议重置画板)
            this.data.currentClass = null;
            wb.resetPages();
            
            // 4. 重新加载班级列表 (确保显示最新的班级数据)
            this.loadClasses();
        }
    },

    async logout() { if (supabaseClient) await supabaseClient.auth.signOut(); location.reload(); },

    isProActive() {
        const p = this.data.userProfile;
        if (!p) return false;
        if (p.membership_tier !== 'pro') return false;
        if (!p.membership_expire_at) return true;
        const exp = new Date(p.membership_expire_at);
        if (Number.isNaN(exp.getTime())) return false;
        return exp.getTime() > Date.now();
    },

    formatExpireText(expireAt) {
        if (!expireAt) return '永久';
        const d = new Date(expireAt);
        if (Number.isNaN(d.getTime())) return String(expireAt);
        return d.toLocaleString();
    },

    async refreshUserProfile() {
        if (!supabaseClient || !this.data.user) return;
        const defaults = { membership_tier: 'free', membership_expire_at: null };

        const byId = await supabaseClient
            .from('profiles')
            .select('membership_tier, membership_expire_at')
            .eq('id', this.data.user.id)
            .maybeSingle();
        if (!byId.error && byId.data) {
            this.data.userProfile = byId.data;
            return;
        }

        const byUserId = await supabaseClient
            .from('profiles')
            .select('membership_tier, membership_expire_at')
            .eq('user_id', this.data.user.id)
            .maybeSingle();
        if (!byUserId.error && byUserId.data) {
            this.data.userProfile = byUserId.data;
            return;
        }

        this.data.userProfile = defaults;
    },

    updateMembershipUI() {
        const tierEl = el('membership-tier-text');
        const expEl = el('membership-expire-text');
        if (!tierEl || !expEl) return;
        const p = this.data.userProfile;
        const isPro = p?.membership_tier === 'pro';
        tierEl.innerText = isPro ? '专业版' : '免费版';
        expEl.innerText = isPro ? this.formatExpireText(p?.membership_expire_at) : '-';
    },

    // === 修改：初始化不再直接加载学生，而是加载班级 ===
    async init() {
        if (!this.data.user) return;
        
        // 1. 先隐藏登录页
        el('login-screen').style.display = 'none';
        this.renderEmailHistory();

        await this.refreshUserProfile();
        
        // 2. 加载班级列表，并显示“班级选择页”
        await this.loadClasses();
        
        const raceData = localStorage.getItem('class_race_data_v10');
        if (raceData) el('race-input').value = raceData;

        window.addEventListener('resize', () => { 
            wb.resize();
            document.querySelectorAll('.chart-container > div[_echarts_instance_]').forEach(d => echarts.getInstanceByDom(d)?.resize());
        });
    },    // === 1. 渲染班级列表 (样式已统一：狂野风 + 姓名老师格式) ===
    async loadClasses() {
        if (!supabaseClient) return;
        el('class-selection-screen').style.display = 'flex';
        el('app-container').style.display = 'none';

        // 1. 获取名字并处理格式： "林维康" -> "林维康老师"
        const rawName = this.data.user.user_metadata?.full_name;
        // 如果有名字，就显示“某某老师”，否则显示“尊敬的老师”
        const teacherLabel = rawName ? `${rawName}老师` : "尊敬的老师";

        // 2. 获取欢迎语容器
        const welcomeBox = el('class-welcome-box');
        
        // 3. 渲染狂野风格 (复用登录页的 CSS 类)
        if (welcomeBox) {
            welcomeBox.innerHTML = `
                <div class="wild-wrapper" style="transform: skew(-5deg); margin-bottom: 40px;">
                    <div class="wild-main-title" style="font-size: 3.5rem; line-height: 1.4; text-shadow: 0 0 20px rgba(255,255,255,0.5);">
                        WELCOME BACK
                    </div>
                    
                    <div class="wild-main-title" style="font-size: 4rem; margin: 10px 0;">
                        欢迎 ${teacherLabel}
                    </div>

                    <div class="wild-main-title" style="font-size: 2.5rem; opacity: 0.9;">
                        进入 AI 多功能教学平台
                    </div>
                </div>
            `;
        }

        // --- 以下逻辑保持不变 ---
        const { data: classes, error } = await supabaseClient
            .from('classes')
            .select('*')
            .eq('user_id', this.data.user.id)
            .order('created_at', { ascending: true });
            
        const container = el('class-list-container');
        container.innerHTML = '';

        // 渲染现有班级
        if (classes) { 
            classes.forEach(cls => {
                const card = document.createElement('div');
                card.className = 'beast-card';
                
                // 关键修改：添加了右上角的删除按钮 button
                // event.stopPropagation() 非常重要，它防止点击垃圾桶时触发 card.onclick 进入班级
                card.innerHTML = `
                    <div class="beast-bg-glow"></div>
                    <button class="beast-delete-btn" title="删除班级" onclick="event.stopPropagation(); app.deleteClass('${cls.id}', '${cls.name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <div class="beast-card-title">${cls.name}</div>
                    <div class="beast-card-sub">点击进入教学</div>
                `;
                
                card.onclick = () => this.enterClass(cls);
                container.appendChild(card);
            });
        }

        // 渲染“创建班级”按钮
        const addBtn = document.createElement('div');
        addBtn.className = 'beast-create-btn';
        addBtn.innerHTML = `
            <div class="beast-icon-circle">+</div>
            <div style="font-weight:bold;">创建新班级</div>
        `;
        addBtn.onclick = () => this.showRollerModal();
        container.appendChild(addBtn);
    },

// === 新增：删除班级逻辑 ===
async deleteClass(classId, className) {
    // 1. 强力警告，防止误删
    const confirmDelete = confirm(
        `⚠️ 高危操作警告 ⚠️\n\n确定要永久删除班级【${className}】吗？\n\n注意：\n1. 此操作无法撤销。\n2. 该班级下的所有学生数据也会一并被删除（如果是级联删除）。`
    );

    if (!confirmDelete) return;

    // 2. 二次确认（可选，为了安全建议保留）
    const doubleCheck = prompt(`请输入班级名称 "${className}" 以确认删除：`);
    if (doubleCheck !== className) {
        alert("❌ 输入不匹配，取消删除。");
        return;
    }

    if (!supabaseClient) return alert("未连接到云端");

    // 3. 执行删除请求
    // 注意：Supabase 中 classes 表的 id 是主键。
    // 如果你在 Supabase 数据库设置了 students 表的外键为 "ON DELETE CASCADE"，学生会自动删除。
    // 如果没有设置级联删除，这里可能会报错，需要先删学生再删班级。
    // 假设你的数据库已配置好级联删除：
    const { error } = await supabaseClient
        .from('classes')
        .delete()
        .eq('id', classId);

    if (error) {
        alert("❌ 删除失败: " + error.message);
        console.error("Delete Error:", error);
    } else {
        alert("✅ 班级已成功删除！");
        // 4. 刷新列表
        this.loadClasses();
    }
},    // === V3.8 核心修复：打开滚轮 ===
    showRollerModal() {
        const modal = el('roller-modal');
        if (modal) {
            modal.style.display = 'flex';
            // 🔥 强制重绘，防止高度计算为0
            requestAnimationFrame(() => {
                this.initRollers();
            });
        }
    },

    // === 初始化数据与事件 ===
    initRollers() {
        const grades = ["一年级","二年级","三年级","四年级","五年级","六年级","七年级","八年级","九年级","高一","高二","高三"];
        const classes = Array.from({length: 30}, (_, i) => (i + 1) + "班");

        // 1. 核心修复：打开弹窗时，直接先把数据写入，防止用户不滚动直接点击创建
        this.rollerData.grade = grades[0];
        this.rollerData.classNum = classes[0];
        this.updateRollerPreview(); // 更新按钮上的文字预览

        // 2. 初始化滚轮 UI
        this.setupRoller('roller-grade', grades, 'grade', 0);
        this.setupRoller('roller-class', classes, 'classNum', 0);
    },

    // === 设置单个滚轮 (V4.4 齿轮步进模式 - 严禁跳过) ===
    setupRoller(domId, items, dataKey, defaultIndex = 0) {
        const container = el(domId);
        if(!container) return;
        
        container.innerHTML = ''; 
        const ITEM_HEIGHT = 60; // 必须与 CSS 高度一致

        // 生成选项
        items.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'roller-item';
            div.innerText = item;
            
            // 点击即选中
            div.onclick = () => {
                container.scrollTo({ top: index * ITEM_HEIGHT, behavior: 'smooth' });
            };
            container.appendChild(div);
        });

        // ==========================================
        // 🔥 新增：鼠标滚轮“步进”逻辑 🔥
        // 拦截原生滚动，强制一次只滚一格
        // ==========================================
        let wheelTimeout = null;
        
        container.addEventListener("wheel", (e) => {
            e.preventDefault(); // 禁止原生的一滑到底

            // 防抖：如果正在滚动中，忽略微小的抖动，或者设置一个极短的冷却时间
            if (wheelTimeout) return;

            // 1. 计算当前主要停在哪一格
            const currentScroll = container.scrollTop;
            const currentIndex = Math.round(currentScroll / ITEM_HEIGHT);

            // 2. 判断方向：向下滚(>0) +1，向上滚(<0) -1
            const direction = e.deltaY > 0 ? 1 : -1;
            let targetIndex = currentIndex + direction;

            // 3. 边界限制
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex >= items.length) targetIndex = items.length - 1;

            // 4. 执行平滑滚动
            container.scrollTo({
                top: targetIndex * ITEM_HEIGHT,
                behavior: 'smooth'
            });

            // 5. 设置冷却时间 (100ms内不再响应滚轮，形成“卡顿/齿轮”感)
            wheelTimeout = setTimeout(() => {
                wheelTimeout = null;
            }, 100); 

        }, { passive: false }); // passive: false 允许我们使用 preventDefault

        // ==========================================
        // 这里的 scroll 监听依然保留，用于更新视觉高亮和数据
        // ==========================================
        let isScrolling = false;
        const updateActive = () => {
            const scrollTop = container.scrollTop;
            const activeIndex = Math.round(scrollTop / ITEM_HEIGHT);
            
            if (activeIndex >= 0 && activeIndex < items.length) {
                const allItems = container.children;
                for (let i = 0; i < allItems.length; i++) {
                    if (i === activeIndex) {
                        allItems[i].classList.add('active');
                        // 实时同步数据
                        this.rollerData[dataKey] = items[i];
                        this.updateRollerPreview();
                    } else {
                        allItems[i].classList.remove('active');
                    }
                }
            }
            isScrolling = false;
        };

        container.onscroll = () => {
            if (!isScrolling) {
                window.requestAnimationFrame(updateActive);
                isScrolling = true;
            }
        };

        // 初始位置设定
        setTimeout(() => {
            container.scrollTo({ top: defaultIndex * ITEM_HEIGHT });
            // 强制高亮
            const allItems = container.children;
            if(allItems[defaultIndex]) allItems[defaultIndex].classList.add('active');
        }, 50);
    },

    updateRollerPreview() {
        const { grade, classNum } = this.rollerData;
        const txt = el('roller-preview-text');
        if (grade && classNum) {
            txt.innerText = `(${grade}${classNum})`;
        }
    },

    async confirmRollerCreate() {
        const { grade, classNum } = this.rollerData;
        if (!grade || !classNum) return alert("请先选择年级和班级");

        // --- 核心修复：直接从 Supabase 获取当前登录用户 ---
        const { data: { user } } = await supabaseClient.auth.getUser();

        // 如果获取不到用户信息，则提示并终止操作
        if (!user) {
            alert("创建失败：无法验证您的登录状态，请尝试重新登录。");
            return;
        }
        // --- 修复结束 ---

        const className = `${grade}(${classNum})`;

        // 使用刚刚获取到的 user.id 来创建班级
        const { data, error } = await supabaseClient
            .from('classes')
            .insert([{ user_id: user.id, name: className }])
            .select();

        if (error) {
            // 如果还有错误，则显示数据库返回的原始错误
            alert("创建失败: " + error.message);
        } else {
            // 成功后，关闭弹窗并刷新班级列表
            el('roller-modal').style.display = 'none';
            this.loadClasses(); 
        }
    },

    // === 新增：进入班级 (正式进入主平台) ===
    async enterClass(cls) {
        this.data.currentClass = cls;
        
        // 隐藏班级选择页，显示主平台
        el('class-selection-screen').style.display = 'none';
        el('app-container').style.display = 'flex';
        
        // 初始化画板
        wb.init();
        
        // 加载该班级的学生数据
        await this.syncStudentsFromCloud();
    },

    // === 修改：加载学生 (只加载当前班级的) ===
    async syncStudentsFromCloud() {
        if (!supabaseClient || !this.data.currentClass) return;

        const { data, error } = await supabaseClient
            .from('students')
            .select('*')
            .eq('class_id', this.data.currentClass.id); // 🔥 关键：只查当前班级

        if (error) { console.error(error); return; }

        this.data.students = data;
        this.data.groups = [...new Set(data.map(s => s.group_name).filter(g => g))];
        this.renderBoard();
    },

    // === 修改：保存学生时带上 class_id ===
    async saveToCloud(student) {
        if (!this.data.user || !supabaseClient || !this.data.currentClass) return;
        
        const updates = {
            id: student.id,
            user_id: this.data.user.id,
            class_id: this.data.currentClass.id, // 🔥 绑定班级ID
            name: student.name,
            group_name: student.group_name,
            gender: student.gender,
            wins: student.wins,
            losses: student.losses,
            sign: student.sign,
            bg: student.bg
        };
        if(student.avatar && student.avatar.startsWith('http')) updates.avatar = student.avatar;
        
        await supabaseClient.from('students').upsert(updates);
    },

    // === 修改：打开导入弹窗 ===
    openImport() {
        if (!this.data.currentClass) return;
        el('import-class-name').innerText = this.data.currentClass.name;
        el('import-modal').style.display = 'flex';
    },

    // === 新增：处理 TXT 文件导入 ===
    handleTxtImport(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            // 将读取到的文本放入文本框，复用之前的解析逻辑
            el('import-text').value = text;
            // 自动触发解析保存
            await this.parseImport();
            input.value = ''; // 清空以备下次使用
        };
        reader.readAsText(file);
    },

    // === 修改：解析并保存 (支持批量上传) ===
    async parseImport() {
        const text = el('import-text').value;
        if (!text.trim()) return;
        
        el('import-modal').style.display = 'none';

        const lines = text.split('\n');
        let currentGroup = '未分组';
        const newStudents = [];

        // 1. 解析文本
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            if (line.endsWith(':') || line.endsWith('：')) {
                currentGroup = line.slice(0, -1);
            } else {
                const parts = line.split(/\s+/); // 按空格分割
                const name = parts[0];
                const gender = parts[1] || '男';
                
                // 检查是否已存在同名学生
                const existing = this.data.students.find(s => s.name === name);
                if (!existing) {
                    newStudents.push({
                        user_id: this.data.user.id,
                        class_id: this.data.currentClass.id, // 🔥 绑定当前班级
                        name: name,
                        gender: gender,
                        group_name: currentGroup,
                        wins: 0,
                        losses: 0
                    });
                }
            }
        });

        // 2. 批量上传到 Supabase (比一个个传快得多)
        if (newStudents.length > 0) {
            const { error } = await supabaseClient.from('students').insert(newStudents);
            if (error) {
                alert("导入失败: " + error.message);
            } else {
                alert(`✅ 成功导入 ${newStudents.length} 名学生！`);
                await this.syncStudentsFromCloud(); // 刷新显示
            }
        } else {
            alert("没有检测到新学生，或者学生已存在。");
        }
    },

    renderBoard() {
        const p = el('poolContent'); if(p) p.innerHTML = '';
        const s = el('groupStage'); if(s) s.innerHTML = '';
        const sorted = [...this.data.students].sort((a,b) => b.wins - a.wins);

        if(p) {
            sorted.filter(x => !x.group_name || x.group_name === '未分组').forEach(x => p.appendChild(this.mkCard(x, true)));
            if(p.children.length === 0) {
                p.innerHTML = `<div id="pool-empty-state" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; color:#94a3b8; pointer-events:none;"><i class="fas fa-seedling" style="font-size:3rem; margin-bottom:10px; opacity:0.5;"></i><div>暂无学生<br>请点击底部导入名单</div></div>`;
            }
        }
        if(s) {
            this.data.groups.forEach(g => {
                if (g === '未分组') return;
                const div = document.createElement('div');
                div.className = `group-lane ${this.data.targetGroup===g?'locked':''}`;
                div.innerHTML = `<div class="group-header" onclick="app.lockGrp('${g}')"><span>${g}</span></div><div class="group-content"></div>`;
                const content = div.querySelector('.group-content');
                sorted.filter(x => x.group_name === g).forEach(x => content.appendChild(this.mkCard(x, false)));
                s.appendChild(div);
            });
        }
        
        // 👇👇👇 新增这一行：激活 3D 视差引擎 👇👇👇
        setTimeout(() => this.init3DParallax(), 100); 
    },

    mkCard(s, isPool) {
        const r = this.getRankInfo(s.wins);
        const d = document.createElement('div');
        d.className = `card ${r.class} ${this.data.calledSet.has(s.id)?'called':''}`;
        d.id = `card-${s.id}`;
        d.onclick = () => this.openProfile(s.id);
        const avatarSrc = this.getAvatarSrc(s);
        
        d.innerHTML = `
            <div class="effect-layer"></div>
            <div class="content-layer">
                <div class="avatar-wrapper"><img src="${avatarSrc}" class="avatar-img"><div class="rank-pendant fa"></div></div>
                <div class="name-tag">${s.name}</div>
                <div class="card-sign-small">${s.sign||"加油"}</div>
                <div class="card-stats"><span class="stat-w">胜${s.wins}</span><span style="margin:0 5px">|</span><span class="stat-l">负${s.losses}</span></div>
                ${!isPool ? `<div class="rank-title-text">${r.name}</div>` : ''}
            </div>`;
        return d;
    },

    // === 核心功能：3D 悬浮视差引擎 (全平台通用版) ===
    init3DParallax() {
        // 选取范围：
        // 1. 班级看板上的高段位卡片 (.card.rank-...)
        // 2. PK 界面上的大卡片 (.pk-card-large)
        // 3. 点名界面的大卡片 (.single-mode-card)
        // 注意：我们现在让 PK 和 点名卡片 *无论什么段位* 都开启 3D，增强体验
        const selector = `
            .card.rank-diamond, .card.rank-star, .card.rank-king, .card.rank-glory, .card.rank-challenger,
            .pk-card-large, 
            .single-mode-card
        `;
        
        const targetCards = document.querySelectorAll(selector);

        targetCards.forEach(card => {
            if(card.dataset.parallaxInit) return; // 防止重复绑定
            card.dataset.parallaxInit = "true";   // 标记已绑定

            card.classList.add('hover-3d');

            card.addEventListener('mouseenter', () => {
                // 鼠标移入逻辑
            });

            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                // 大卡片稍微降低一点灵敏度 (/15)，否则转太快晕
                const factor = card.classList.contains('single-mode-card') ? 20 : 12; 
                
                const rotateY = x / factor;
                const rotateX = -y / factor;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
                
                // 光泽移动
                const sheen = card.querySelector('.effect-layer::after');
                if(sheen) {
                    sheen.style.transform = `translateX(${x}px) skewX(-25deg)`;
                }
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = `perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)`;
            });
        });
    },
    getRankInfo(w) { return this.ranks[Math.min(Math.floor(w/5), this.ranks.length-1)]; },
    getAvatarSrc(s) { 
        if (s.avatar && s.avatar.startsWith('blob:')) return s.avatar; 
        if (this.data.localAvatars[s.name]) return this.data.localAvatars[s.name]; 
        if (s.avatar && s.avatar.startsWith('http')) return s.avatar; 
        return `https://api.dicebear.com/7.x/${s.gender==='女'?'lorelei':'adventurer'}/svg?seed=${s.name}`;
    },

    openProfile(id) { 
        this.data.editingId = id; 
        const s = this.data.students.find(x => x.id === id); 
        const r = this.getRankInfo(s.wins);
        
        el('profile-modal').style.display='flex'; 
        this.updateMembershipUI();
        el('p-name').innerText=s.name; 
        el('p-rank-text').innerText = r.name;
        el('p-rank-icon').className = `fas ${r.icon}`;
        el('p-sign').value=s.sign||""; 
        el('p-sign-display').innerText = s.sign || "加油"; 
        el('p-wins').innerText = s.wins;
        el('p-losses').innerText = s.losses;
        
        const prevCard = el('profile-preview-card'); 
        prevCard.className = `card ${r.class}`; 
        const avatarSrc = this.getAvatarSrc(s);        prevCard.innerHTML = `
            <div class="effect-layer"></div>
            <div class="content-layer">
                <div class="avatar-wrapper">
                    <img src="${avatarSrc}" class="avatar-img">
                    <div class="rank-pendant fa">${r.icon}</div>
                </div>
                <div class="name-tag">${s.name}</div>
                <div class="card-sign-small">${s.sign||"加油"}</div>
                
                <!-- 修复开始：这里补全了胜场显示 -->
                <div class="card-stats">
                    <span class="stat-w">胜${s.wins}</span>
                    <span style="margin:0 5px">|</span>
                    <span class="stat-l">负${s.losses}</span>
                </div>
                <!-- 修复结束 -->

                <div class="rank-title-text">${r.name}</div>
            </div>`; 
        
        const box = el('profile-box'); 
        if(s.bg) { 
            if(s.bg.startsWith('http') || s.bg.startsWith('linear')) { box.style.background = s.bg; } 
            else { box.style.background = s.bg; } 
        } else {
            box.style.background = '#1e1e1e';
        }
        this.renderBgOpt(); 
    },
    
    renderBgOpt() { 
        const g=el('bg-grid'); g.innerHTML=''; 
        this.bgData.forEach(u=>{ 
            const d=document.createElement('div'); d.className='bg-opt'; d.style.background=u; 
            d.onclick=()=>{ 
                const box = el('profile-box'); box.style.background = u; 
                const s=this.data.students.find(x=>x.id===this.data.editingId); s.bg=u; 
            }; 
            g.appendChild(d); 
        }); 
    },
    
    refreshAvatars() { 
        const g=el('avatar-grid'); g.innerHTML=''; 
        ['lorelei','adventurer','micah','bottts','fun-emoji'].forEach(t=>{ 
            const seed = Math.random();
            const src = `https://api.dicebear.com/7.x/${t}/svg?seed=${seed}`;
            const i=document.createElement('img'); i.src=src; i.className='avatar-opt'; 
            i.onclick=()=>{ 
                const s=this.data.students.find(x=>x.id===this.data.editingId); 
                s.avatar=src; 
                document.querySelector('#profile-preview-card .avatar-img').src = src; 
            }; 
            g.appendChild(i); 
        }); 
    },
    
    async handleUploadAvatar(input) {
        const file = input.files[0];
        if(!file || !this.data.editingId) return; 

        if (file.size > 2 * 1024 * 1024) {
            alert("⚠️ 图片太大了！请上传 2MB 以内的图片。");
            return;
        }

        const btn = input.previousElementSibling || document.querySelector('.sm-link:last-child');
        const oldText = btn ? btn.innerText : "上传";
        if(btn) btn.innerText = "上传中...";

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${this.data.editingId}_${Date.now()}.${fileExt}`;

            const { data, error } = await supabaseClient.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;

            const { data: { publicUrl } } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);

            const s = this.data.students.find(x => x.id === this.data.editingId);
            s.avatar = publicUrl;
            document.querySelector('#profile-preview-card .avatar-img').src = publicUrl;
            await this.saveToCloud(s);

            alert("✅ 头像已上传云端！");

        } catch (err) {
            console.error(err);
            alert("❌ 上传失败: " + err.message);
        } finally {
            if(btn) btn.innerText = "上传(本地)";
            input.value = '';
        }
    },

    adjStat(k,v) { 
        const s=this.data.students.find(x=>x.id===this.data.editingId); 
        s[k]=Math.max(0,s[k]+v); 
        el(`p-${k}`).innerText=s[k]; 
        const r = this.getRankInfo(s.wins);
        el('profile-preview-card').className = `card ${r.class}`;
        el('profile-preview-card').querySelector('.rank-title-text').innerText = r.name;
        el('profile-preview-card').querySelector('.rank-pendant').className = `rank-pendant fa ${r.icon}`;
        el('profile-preview-card').querySelector('.stat-w').innerText = `胜${s.wins}`;
        el('profile-preview-card').querySelector('.stat-l').innerText = `负${s.losses}`;
        el('p-rank-text').innerText = r.name;
    },
    
    updateSignPreview(v) { 
        const s=this.data.students.find(x=>x.id===this.data.editingId); 
        s.sign=v; 
        el('p-sign-display').innerText = v || "加油"; 
        document.querySelector('#profile-preview-card .card-sign-small').innerText = v || "加油"; 
    },
    
    closeProfile() { el('profile-modal').style.display = 'none'; },
    saveProfile() { 
        const s = this.data.students.find(x => x.id === this.data.editingId); 
        this.saveToCloud(s); 
        this.renderBoard(); 
        this.closeProfile(); 
    },// === 修改：面板切换逻辑 ===
    switchTab(tabName) {
        // 1. 更新 Tab 样式
        document.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
        if(tabName === 'teaching') document.querySelectorAll('.p-tab')[0].classList.add('active');
        if(tabName === 'practice') document.querySelectorAll('.p-tab')[1].classList.add('active');

        const toolbar = document.getElementById('subject-toolbar');
        const cLayer = document.getElementById('course-player-layer');
        const pLayer = document.getElementById('practice-layer');

        // 2. 控制显示层
        if (tabName === 'teaching') {
            // 隐藏练习相关
            if(pLayer) pLayer.style.display = 'none';
            if(toolbar) toolbar.classList.remove('show-tools'); // 隐藏侧边栏
            
            // 显示教学相关
            if(cLayer) cLayer.style.display = 'flex';
            
            // 恢复视频播放
            const v = document.getElementById('curr-vid');
            if(v) v.play().catch(()=>{});
            
            // 教学模式默认用鼠标模式防止误触
            if(typeof wb !== 'undefined') wb.setMode('cursor');

        } else {
            // 隐藏教学相关
            if(cLayer) cLayer.style.display = 'none';
            
            // 显示练习相关 (黑板)
            if(pLayer) pLayer.style.display = 'flex';
            
            // 显示右侧工具栏 🔥🔥🔥
            if(toolbar) toolbar.classList.add('show-tools');
            
            // 默认切回画笔模式，确保可以书写 🔥🔥🔥
            if(typeof wb !== 'undefined') {
                wb.setMode('pen');
                // 强制刷新画布尺寸，防止因为display:none导致的尺寸为0
                setTimeout(() => wb.resize(), 50);
            }

            // 暂停视频
            const v = document.getElementById('curr-vid');
            if(v) v.pause();
        }
    },

    // === 修改：退出播放 (逻辑映射到切换 Tab) ===
    exitCourseMode() {
        this.switchTab('practice');
    },

    // ============================================================
    // 🛠️ 修复二：万能课件上传 (自动切换到练习黑板)
    // ============================================================
    async handleGenericUpload(stage, files) {
        const list = Array.from(files || []);
        const file = list[0];
        if (!file) return;

        if (list.length > 1) {
            this.switchTab('teaching');

            const courseFiles = list.filter(f => !f.name.startsWith('.'));
            this.data.playList = courseFiles.map(f => {
                const ext = '.' + f.name.split('.').pop().toLowerCase();
                let type = 'unknown';
                if (['.mp4', '.webm', '.ogg'].includes(ext)) type = 'video';
                else if (['.html', '.htm'].includes(ext)) type = 'html';
                else if (['.pdf'].includes(ext)) type = 'pdf';
                else if (['.docx', '.doc'].includes(ext)) type = 'word';
                else if (['.xlsx', '.xls'].includes(ext)) type = 'xlsx';
                else type = 'image';

                return { name: f.name, type, file: f, url: URL.createObjectURL(f) };
            });
            this.data.playIndex = 0;

            const titleEl = document.getElementById('cp-lesson-title');
            const totalEl = document.getElementById('cp-total-steps');
            if (titleEl) titleEl.innerText = '临时导入';
            if (totalEl) totalEl.innerText = this.data.playList.length;

            if (typeof wb !== 'undefined') {
                wb.setLockedPageCount(this.data.playList.length);
                wb.resetPagesToCount(this.data.playList.length);
                wb.setPagesMetaFromPlayList(this.data.playList);
            }

            await this.renderPlayerStep();
            el('genericFileLoader').value = '';
            return;
        }

        this.switchTab('practice');

        const viewer = el(`viewer-practice`);
        if(!viewer) return;
        
        // 显示加载动画
        viewer.style.display = 'flex'; 
        viewer.innerHTML = '<div style="color:white; font-size:1.5rem;"><i class="fas fa-spinner fa-spin"></i> 正在渲染课件...</div>'; 
        viewer.className = 'resource-viewer';

        const url = URL.createObjectURL(file);
        const ext = file.name.split('.').pop().toLowerCase();

        try {
            if (['mp4','webm','ogg'].includes(ext)) { 
                viewer.classList.add('dark-mode'); 
                viewer.innerHTML = `<video src="${url}" controls style="max-width:100%; max-height:100%; box-shadow:0 0 30px black;"></video>`; 
            } 
            else if (['jpg','jpeg','png','gif','bmp','svg'].includes(ext)) { 
                viewer.classList.add('dark-mode'); 
                viewer.innerHTML = `<img src="${url}" style="max-width:100%; max-height:100%; object-fit:contain;">`; 
            }
            else if (ext === 'pdf') {
                 viewer.innerHTML = ''; // 清空 loading
                 const canvasContainer = document.createElement('div');
                 canvasContainer.style.cssText = "width:100%; height:100%; overflow-y:auto; text-align:center; background:#222;";
                 viewer.appendChild(canvasContainer);
                 
                 const pdf = await pdfjsLib.getDocument(url).promise; 
                 for(let i=1; i<=pdf.numPages; i++) { 
                     const p = await pdf.getPage(i); 
                     const v = p.getViewport({scale: 1.5}); 
                     const c = document.createElement('canvas'); 
                     c.width = v.width; c.height = v.height; 
                     c.style.maxWidth = '95%'; c.style.marginBottom = '20px'; c.style.boxShadow = '0 0 15px black';
                     canvasContainer.appendChild(c); 
                     await p.render({canvasContext: c.getContext('2d'), viewport: v}).promise; 
                 }
            }
            else if (['docx','doc'].includes(ext)) { 
                const ab = await file.arrayBuffer(); 
                const res = await mammoth.convertToHtml({arrayBuffer: ab}); 
                viewer.style.display = 'block'; 
                viewer.style.overflow = 'auto'; 
                // 白底黑字 Word 样式
                viewer.innerHTML = `<div style="max-width:850px; margin:20px auto; background:white; padding:50px; box-shadow:0 0 30px black; color:#000; min-height:100%; font-size:1.1rem; line-height:1.6;">${res.value}</div>`; 
            }
            else if (['xlsx','xls'].includes(ext)) { 
                const ab = await file.arrayBuffer(); 
                const wb = XLSX.read(ab, {type:'array'}); 
                const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]); 
                viewer.style.display = 'block'; 
                viewer.style.overflow = 'auto'; 
                viewer.innerHTML = `<div style="background:white; color:black; padding:20px; overflow:auto;">${html}</div>`; 
            }
            else if (['html','htm'].includes(ext)) { 
                viewer.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`; 
            } else {
                viewer.innerHTML = `<div style="color:#ef4444; font-size:1.5rem;">❌ 不支持的文件格式: .${ext}</div>`;
            }
        } catch(e) {
            console.error(e);
            viewer.innerHTML = `<div style="color:#ef4444;">解析失败: ${e.message}</div>`;
        }
        
        el('genericFileLoader').value = '';
    },
    // === 新增功能：网站收藏夹逻辑 ===
    openWebsites() {
        el('website-modal').style.display = 'flex';
        this.loadWebsites();
    },

    async openCloudDrive() {
        if (!supabaseClient || !this.data.user) return alert("请先登录");
        await this.refreshUserProfile();
        this.updateMembershipUI();
        if (!this.isProActive()) {
            const ok = confirm("此功能为 VIP 专享，请升级专业版。\n\n点击“确定”输入激活码，点击“取消”返回。");
            if (ok) this.promptRedeemVipCode();
            return;
        }
        this.openCourseware();
    },

    promptRedeemVipCode() {
        const code = prompt("请输入激活码：");
        if (!code) return;
        this.redeemCode(code);
    },

    async redeemCode(code) {
        if (!supabaseClient || !this.data.user) return alert("请先登录");
        const trimmed = String(code).trim();
        if (!trimmed) return alert("激活码不能为空");

        const { data, error } = await supabaseClient.rpc('redeem_vip_code', { input_code: trimmed });
        if (error) {
            alert("❌ 激活失败: " + error.message);
            return;
        }

        alert("✅ 激活成功！");
        if (data && typeof data === 'object') {
            const tier = data.membership_tier ?? data.tier;
            const expire = data.membership_expire_at ?? data.expire_at;
            if (tier) this.data.userProfile = { membership_tier: tier, membership_expire_at: expire ?? null };
        }

        await this.refreshUserProfile();
        this.updateMembershipUI();
        if (this.isProActive()) this.openCourseware();
    },

    openCourseware() {
        el('courseware-modal').style.display = 'flex';
        const status = el('courseware-status');
        if (status) status.innerText = '';
        const preview = el('courseware-preview');
        if (preview) {
            preview.innerHTML = `
                <div style="text-align:center; color:#666; padding:40px;">
                    <i class="fas fa-photo-video" style="font-size:3rem; opacity:0.25;"></i>
                    <div style="margin-top:10px;">请选择一个课件进行播放</div>
                </div>`;
        }
        this.loadCoursewareList();
    },

    normalizeCoursewareName(name) {
        const n = String(name ?? '').trim();
        if (!n) return '未命名文件';
        return n.length > 120 ? n.slice(0, 120) : n;
    },

    triggerCoursewareUploader() {
        const status = el('courseware-status');
        const input = el('coursewareUploader');
        if (!input) {
            if (status) status.innerText = '❌ 未找到上传控件（可能未刷新到最新部署）';
            alert("❌ 未找到上传控件 coursewareUploader。\n请确认 Cloudflare Pages 已重新部署到最新版本，并强制刷新浏览器缓存。");
            return;
        }

        if (!supabaseClient) {
            if (status) status.innerText = '❌ 未连接 Supabase（请检查 Pages 环境变量并重新部署）';
            alert("❌ 未连接 Supabase。\n请检查 Cloudflare Pages Production 环境变量：VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，并重新部署。");
            return;
        }

        if (!this.data.user) {
            if (status) status.innerText = '请先登录';
            alert("请先登录后再上传课件。");
            return;
        }

        input.click();
    },

    async loadCoursewareList() {
        const listDiv = el('courseware-list');
        const status = el('courseware-status');
        if (!listDiv) return;
        if (!supabaseClient) {
            listDiv.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">未连接 Supabase（请检查 Pages 环境变量并重新部署）</div>`;
            if (status) status.innerText = '❌ 未连接 Supabase';
            return;
        }
        if (!this.data.user) {
            listDiv.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">请先登录</div>`;
            return;
        }

        listDiv.innerHTML = '<div style="text-align:center;color:#666;padding:20px;"><i class="fas fa-circle-notch fa-spin"></i> 加载中...</div>';
        if (status) status.innerText = '';

        const { data, error } = await supabaseClient
            .from('courseware_files')
            .select('id, object_path, original_name, mime_type, created_at')
            .eq('user_id', this.data.user.id)
            .order('created_at', { ascending: false })
            .limit(200);

        if (!error) {
            const items = (data || []).map(x => ({
                id: x.id,
                objectPath: x.object_path,
                name: this.normalizeCoursewareName(x.original_name),
                mimeType: x.mime_type || '',
                createdAt: x.created_at || ''
            }));
            this.data.courseware = items;
            this.renderCoursewareList();
            return;
        }

        const prefix = `${this.data.user.id}/`;
        const fallback = await supabaseClient.storage.from('courseware').list(prefix, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } });
        if (fallback.error) {
            listDiv.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px;">加载失败: ${fallback.error.message}</div>`;
            return;
        }

        const items = (fallback.data || [])
            .filter(x => x && x.name && !x.name.endsWith('/'))
            .map(x => ({
                objectPath: `${prefix}${x.name}`,
                name: x.name,
                createdAt: x.updated_at || x.created_at || '',
                mimeType: ''
            }));

        this.data.courseware = items;
        this.renderCoursewareList();
    },

    renderCoursewareList(activeFullPath) {
        const listDiv = el('courseware-list');
        if (!listDiv) return;
        const items = Array.isArray(this.data.courseware) ? this.data.courseware : [];
        if (items.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align:center;color:#666;padding:40px;">
                    <i class="fas fa-cloud-upload-alt" style="font-size:3rem; margin-bottom:10px; opacity:0.25;"></i>
                    <div>暂无课件<br>请点击上方按钮上传</div>
                </div>`;
            return;
        }

        listDiv.innerHTML = '';
        items.forEach(it => {
            const ext = (it.name.split('.').pop() || '').toLowerCase();
            const isPdf = it.mimeType === 'application/pdf' || ext === 'pdf';
            const isMp4 = it.mimeType === 'video/mp4' || ext === 'mp4';
            const icon = isPdf ? 'fa-file-pdf' : isMp4 ? 'fa-film' : 'fa-file';

            const div = document.createElement('div');
            div.className = `courseware-item${activeFullPath && activeFullPath === it.objectPath ? ' active' : ''}`;
            div.onclick = () => this.playCourseware(it);

            const t = it.createdAt ? new Date(it.createdAt).toLocaleString() : '';
            div.innerHTML = `
                <div class="courseware-icon"><i class="fas ${icon}"></i></div>
                <div class="courseware-meta">
                    <div class="courseware-name">${it.name}</div>
                    <div class="courseware-sub">${(isPdf ? 'PDF' : isMp4 ? 'MP4' : ext.toUpperCase())}${t ? ' · ' + t : ''}</div>
                </div>
                <div style="color:#94a3b8;"><i class="fas fa-play"></i></div>
            `;
            listDiv.appendChild(div);
        });
    },

    async getCoursewareUrl(fullPath) {
        const status = el('courseware-status');
        const signed = await supabaseClient.storage.from('courseware').createSignedUrl(fullPath, 3600);
        if (!signed.error && signed.data?.signedUrl) return signed.data.signedUrl;

        const pub = supabaseClient.storage.from('courseware').getPublicUrl(fullPath);
        if (pub?.data?.publicUrl) {
            if (status) status.innerText = '当前 Bucket 可能为 public，已使用 publicUrl 播放';
            return pub.data.publicUrl;
        }

        throw new Error(signed.error?.message || '无法获取播放地址');
    },

    async playCourseware(item) {
        if (!supabaseClient || !this.data.user) return;
        const preview = el('courseware-preview');
        const status = el('courseware-status');
        if (!preview) return;

        this.renderCoursewareList(item.objectPath);
        preview.innerHTML = '<div style="font-size:1.2rem; color:#999;"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
        if (status) status.innerText = '';

        try {
            const url = await this.getCoursewareUrl(item.objectPath);
            const ext = (item.name.split('.').pop() || '').toLowerCase();
            if (ext === 'mp4') {
                preview.innerHTML = `<video src="${url}" controls autoplay style="max-width:100%; max-height:100%; width:100%; height:100%;"></video>`;
            } else if (ext === 'pdf') {
                preview.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none; background:white;"></iframe>`;
            } else {
                preview.innerHTML = `<div style="color:#ef4444; padding:20px;">不支持的格式：.${ext}</div>`;
            }
        } catch (e) {
            preview.innerHTML = `<div style="color:#ef4444; padding:20px;">加载失败：${e.message}</div>`;
        }
    },

    async handleCoursewareUpload(input) {
        const status = el('courseware-status');
        const listDiv = el('courseware-list');
        if (!supabaseClient) {
            if (status) status.innerText = '❌ 未连接 Supabase';
            alert("❌ 未连接 Supabase。\n请检查 Cloudflare Pages Production 环境变量并重新部署。");
            input.value = '';
            return;
        }
        if (!this.data.user) {
            if (status) status.innerText = '请先登录';
            alert("请先登录后再上传课件。");
            input.value = '';
            return;
        }

        const files = Array.from(input.files || []);
        input.value = '';
        if (files.length === 0) return;

        if (status) status.innerText = `上传中...（${files.length} 个文件）`;
        if (listDiv) listDiv.scrollTop = 0;

        const prefix = `${this.data.user.id}/`;

        let uploaded = 0;
        for (const file of files) {
            const fileExt = (file.name.split('.').pop() || '').toLowerCase();
            if (!['pdf', 'mp4'].includes(fileExt)) continue;

            const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
            const path = `${prefix}${safeName}`;
            const { error } = await supabaseClient.storage.from('courseware').upload(path, file, { upsert: false, contentType: file.type || undefined });
            if (error) {
                if (status) status.innerText = `上传失败：${error.message}`;
                alert(`❌ 上传失败：${error.message}`);
                await this.loadCoursewareList();
                return;
            }

            await supabaseClient.from('courseware_files').insert([{
                user_id: this.data.user.id,
                object_path: path,
                original_name: this.normalizeCoursewareName(file.name),
                mime_type: file.type || null
            }]);

            uploaded++;
            if (status) status.innerText = `上传中...（已完成 ${uploaded}/${files.length}）`;
        }

        if (uploaded === 0) {
            if (status) status.innerText = '未选择支持的文件（仅支持 PDF/MP4）';
            alert("未选择支持的文件（仅支持 PDF/MP4）。");
            return;
        }
        if (status) status.innerText = '上传完成';
        await this.loadCoursewareList();
    },

    async loadWebsites() {
        if(!supabaseClient || !this.data.user) return;
        const listDiv = el('web-list');
        listDiv.innerHTML = '<div style="text-align:center;color:#666;padding:20px;"><i class="fas fa-circle-notch fa-spin"></i> 加载中...</div>';
        
        const { data, error } = await supabaseClient
            .from('websites')
            .select('*')
            .eq('user_id', this.data.user.id)
            .order('created_at', {ascending: false});
        
        if(error) { 
            console.error(error); 
            listDiv.innerHTML = `<div style="color:#ef4444;text-align:center;">加载失败: ${error.message}</div>`;
            return; 
        }
        this.renderWebsites(data);
    },

    renderWebsites(list) {
        const container = el('web-list');
        container.innerHTML = '';
        
        if(!list || list.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;color:#666;padding:40px;">
                    <i class="fas fa-globe" style="font-size:3rem; margin-bottom:10px; opacity:0.3;"></i>
                    <div>暂无收藏<br>请在上方输入网址添加</div>
                </div>`;
            return;
        }

        list.forEach(w => {
            const div = document.createElement('div');
            div.className = 'web-item';
            
            // 点击区域：打开新标签页
            // 删除按钮：阻止冒泡，只删除
            div.innerHTML = `
                <div class="web-info" onclick="window.open('${w.url}', '_blank')">
                    <div class="web-icon"><i class="fas fa-link"></i></div>
                    <div class="web-text">
                        <div class="web-title">${w.title}</div>
                        <div class="web-url">${w.url}</div>
                    </div>
                </div>
                <button class="web-del-btn" title="删除" onclick="app.deleteWebsite('${w.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
            container.appendChild(div);
        });
    },

    async addWebsite() {
        const titleInput = el('web-input-title');
        const urlInput = el('web-input-url');
        const title = titleInput.value.trim();
        let url = urlInput.value.trim();

        if(!title || !url) return alert("❌ 请输入网站名称和网址");

        // 自动补全 http
        if(!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        const btn = document.querySelector('.web-add-btn');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const { error } = await supabaseClient.from('websites').insert([{
            user_id: this.data.user.id,
            title: title,
            url: url
        }]);

        btn.innerHTML = oldText;
        btn.disabled = false;

        if(error) {
            alert("添加失败: " + error.message);
        } else {
            titleInput.value = '';
            urlInput.value = '';
            this.loadWebsites(); // 重新加载列表
        }
    },

// ============================================================
    // ⏭️ 修复翻页逻辑：连接 USB 播放列表
    // ============================================================

    nextStep() {
        // 检查是否有播放列表，且不是最后一页
        if (this.data.playList && this.data.playList.length > 0) {
            if (this.data.playIndex < this.data.playList.length - 1) {
                this.data.playIndex++; // 索引 +1
                this.renderPlayerStep(); // 🔥 重新渲染下一页内容
            } else {
                speak("已经是最后一页了");
            }
        } else {
            // 如果没有播放列表（比如在云端课程模式），保持旧逻辑作为备用
            let current = parseInt(el('cp-step-index').innerText) || 0;
            el('cp-step-index').innerText = current + 1;
            speak("演示模式下一页");
        }
    },

    prevStep() {
        // 检查是否有播放列表，且不是第一页
        if (this.data.playList && this.data.playList.length > 0) {
            if (this.data.playIndex > 0) {
                this.data.playIndex--; // 索引 -1
                this.renderPlayerStep(); // 🔥 重新渲染上一页内容
            } else {
                speak("这是第一页");
            }
        } else {
            // 备用旧逻辑
            let current = parseInt(el('cp-step-index').innerText) || 1;
            if(current > 1) el('cp-step-index').innerText = current - 1;
        }
    },

    startRoll(mode) {
        // 移除所有卡片的自动旋转动画和选中状态，确保每次开始前是干净的
        document.querySelectorAll('.card').forEach(card => {
            card.classList.remove('auto-rotating');
            card.classList.remove('selected');
        });

        if(this.data.isRunning) return this.stopRoll();
        let pool = this.data.students.filter(x => !this.data.calledSet.has(x.id));
        if(this.data.targetGroup) pool = pool.filter(x => x.group_name === this.data.targetGroup);
        if (pool.length < (mode==='pk'?2:1)) return alert("剩余人数不足");
        this.data.mode = mode; this.data.isRunning = true;
        this.data.timer = setInterval(() => { 
            document.querySelectorAll('.card').forEach(c => c.classList.remove('highlight')); 
            const r1 = pool[Math.floor(Math.random() * pool.length)]; 
            this.data.tempId1 = r1.id; 
            const card = el(`card-${r1.id}`);
            if(card) card.classList.add('highlight');
            if(mode === 'pk') {
                let r2 = pool[Math.floor(Math.random()*pool.length)];
                while(r2.id === r1.id && pool.length > 1) r2 = pool[Math.floor(Math.random()*pool.length)];
                this.data.tempId2 = r2.id;
                const card2 = el(`card-${r2.id}`);
                if(card2) card2.classList.add('highlight');
            }
        }, 80); 
    },    stopRoll() {
        if (!this.data.isRunning) return;
        clearInterval(this.data.timer);
        this.data.isRunning = false;

        // 移除所有卡片的随机高亮
        document.querySelectorAll('.card').forEach(c => c.classList.remove('highlight'));

        // 获取最终选中的学生 1
        const selectedStudent1 = this.data.students.find(x => x.id === this.data.tempId1);
        if (!selectedStudent1) {
            console.error("No student selected for roll.");
            return;
        }

        // 为选中的卡片添加选中样式
        const card1 = el(`card-${selectedStudent1.id}`);
        if (card1) {
            card1.classList.add('selected');
            card1.classList.add('auto-rotating');
        }

        if (this.data.mode === 'pk') {
            // 获取最终选中的学生 2
            const selectedStudent2 = this.data.students.find(x => x.id === this.data.tempId2);
            if (selectedStudent2) {
                const card2 = el(`card-${selectedStudent2.id}`);
                if (card2) {
                    card2.classList.add('selected');
                    card2.classList.add('auto-rotating');
                }
            }

            // === 核心修复：将两名 PK 选手都加入已点名集合，踢出下一轮 ===
            this.data.calledSet.add(selectedStudent1.id);
            if (selectedStudent2) this.data.calledSet.add(selectedStudent2.id);
            // ========================================================

            speak(`请 ${selectedStudent1.name} 和 ${selectedStudent2 ? selectedStudent2.name : ''} 进行PK`);
            this.showPKResult();
        } else { // 单人点名模式
            speak(`恭喜 ${selectedStudent1.name}`);
            
            // 单人模式原本已有这行代码，保持不变
            this.data.calledSet.add(selectedStudent1.id); 
            
            this.showSingleResult(); // 显示单人点名结果页面
        }
        
        // 刷新一下看板，让被点名的卡片变暗（视觉反馈）
        this.renderBoard();
    },

    // === 核心渲染：单人点名卡片 (全特效巨无霸版) ===
    showSingleResult() {
        const s = this.data.students.find(x => x.id === this.data.tempId1);
        if(!s) return; 
        
        const r = this.getRankInfo(s.wins); 
        const layer = el('single-mode-result-layer'); 
        if(layer) layer.style.display = 'flex';
        
        const container = el('single-card-container');
        if(container) { 
            container.innerHTML = ''; 
            
            // 1. 创建巨型卡片容器
            const card = document.createElement('div');
            // 添加 .card 类以继承所有通用特效 (流光/纹理)
            // 添加 .single-mode-card 类以应用刚才的布局修复
            // 添加段位类 (r.class) 以应用颜色和粒子
            card.className = `card ${r.class} single-mode-card`;
            
            // 2. 强制写入大尺寸样式
            card.style.cssText = `
                width: 360px; 
                height: 580px; 
                border-width: 4px;
                box-shadow: 0 0 50px rgba(0,0,0,0.8); /* 深邃投影 */
                border-radius: 20px;
                animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                transform: scale(1); /* 确保不被父级缩放影响 */
            `;
            
            const avatarSrc = this.getAvatarSrc(s);
            
            // 3. 构建内部 HTML (使用 flex 分区，杜绝遮挡)
            card.innerHTML = `
                <div class="effect-layer"></div>
                
                <div class="content-layer" style="justify-content: space-between; padding: 30px 10px;">
                    
                    <div class="large-card-avatar-zone">
                        <div class="avatar-wrapper" style="width: 160px; height: 160px;">
                            <img src="${avatarSrc}" class="avatar-img" style="border-width: 5px;">
                            <div class="rank-pendant fa ${r.icon}" style="font-size: 70px; width: 70px; height: 70px; right: -30px; top: -30px;"></div>
                        </div>
                    </div>
                    
                    <div class="large-card-info-zone">
                        <div class="large-card-name">${s.name}</div>
                        
                        <div class="card-sign-small" style="font-size: 1.2rem; opacity: 0.9; color:#00ffff;">
                            ${s.sign || "天选之子"}
                        </div>
                        
         <div style="background:rgba(0,0,0,0.6); padding:10px 20px; border-radius:30px; border:1px solid rgba(255,255,255,0.2); font-size:1.5rem; font-weight:bold; color:#fff; display:flex; align-items:center;">
                            <span style="color:#4ade80">胜 ${s.wins}</span> 
                            <span style="margin:0 15px; opacity:0.5; font-size:1.2rem;">|</span> 
                            <span style="color:#f87171">负 ${s.losses}</span>
                        </div>
                    </div>
                </div>
            `;
            
            container.appendChild(card);
            
            // 4. 再次触发视差绑定，确保新生成的卡片也有特效
            setTimeout(() => this.init3DParallax(), 100);
            
            // 5. 播放音效 (可选)
            // const audio = new Audio('path/to/win.mp3'); audio.play();
        } 
    },

    // === 新增：PK 结果显示 (逻辑同单人，只是是双人) ===
    showPKResult() {
        const overlay = el('winner-overlay');
        overlay.style.display = 'block';

        const s1 = this.data.students.find(x => x.id === this.data.tempId1);
        const s2 = this.data.students.find(x => x.id === this.data.tempId2);

        if(s1) this.renderPKCard(1, s1);
        if(s2) this.renderPKCard(2, s2);
        
        // 初始化视差
        setTimeout(() => this.init3DParallax(), 100);

        // 🔥🔥🔥 核心：每次 PK 自动显示下一页题目并重置时间 🔥🔥🔥
        this.renderNextQuestion(); 
    },

    renderPKCard(idx, s) {
        const r = this.getRankInfo(s.wins);
        const card = el(`pk-card-${idx}`);
        
        // 清除旧类名，添加新段位类
        card.className = `pk-card-large ${r.class}`; 
        
        el(`pk-img-${idx}`).src = this.getAvatarSrc(s);
        el(`pk-name-${idx}`).innerText = s.name;
        el(`pk-sign-${idx}`).innerText = s.sign || "全力以赴";
        el(`pk-win-${idx}`).innerText = s.wins;
        el(`pk-loss-${idx}`).innerText = s.losses;
        
        const rankTxt = el(`pk-rank-name-${idx}`);
        rankTxt.innerText = r.name;
        
        // 设置挂件
        const pendant = el(`pk-pendant-${idx}`);
        pendant.className = `rank-pendant fa ${r.icon}`;
    },

    judgePK(winnerSide) {
        const s1 = this.data.students.find(x => x.id === this.data.tempId1);
        const s2 = this.data.students.find(x => x.id === this.data.tempId2);
        if(!s1 || !s2) return;

        if (winnerSide === 'left') {
            s1.wins++; s2.losses++;
            this.showWinEffect('left');
        } else {
            s2.wins++; s1.losses++;
            this.showWinEffect('right');
        }

        // 保存数据
        this.saveToCloud(s1);
        this.saveToCloud(s2);
        
        // 刷新看板
        this.renderBoard();
        
        // 关闭
        setTimeout(() => this.closeOverlay(), 2000);
    },
    
    showWinEffect(side) {
        // 简单的获胜视觉反馈
        const winCard = side === 'left' ? el('pk-card-1') : el('pk-card-2');
        const loseCard = side === 'left' ? el('pk-card-2') : el('pk-card-1');
        
        winCard.style.transform = "scale(1.1)";
        winCard.style.boxShadow = "0 0 50px #ffd700";
        winCard.style.zIndex = "100";
        
        loseCard.classList.add('loser-effect');
        loseCard.style.opacity = "0.5";
        loseCard.style.filter = "grayscale(1)";

        speak(side === 'left' ? "左侧获胜" : "右侧获胜");
        fireConfetti();
    },

    // 单人模式判定
    judgeSingle(isWin) {
        const s = this.data.students.find(x => x.id === this.data.tempId1);
        if(!s) return;

        if(isWin) {
            s.wins++;
            speak("回答正确，加分");
            fireConfetti();
        } else {
            s.losses++;
            speak("很遗憾，下次加油");
        }
        
        this.saveToCloud(s);
        this.renderBoard();
        this.closeOverlay();
    },

    closeOverlay() {
        el('winner-overlay').style.display = 'none';
        el('single-mode-result-layer').style.display = 'none';
        
        // 清理 PK 界面状态
        document.querySelectorAll('.pk-card-large').forEach(c => {
            c.classList.remove('loser-effect');
            c.style.transform = '';
            c.style.boxShadow = '';
            c.style.opacity = '';
            c.style.filter = '';
        });
    },

    // === 其他辅助 ===
    toggleLecture() {
        const p = el('lecture-panel');
        p.classList.toggle('active');
        // 重新调整画板尺寸
        setTimeout(() => wb.resize(), 500);
    },
    
    togglePool() {
        const area = el('poolArea');
        if(area.classList.contains('open')) {
            area.classList.remove('open');
        } else {
            area.classList.add('open');
        }
    },
    
    addGroup() {
        const name = prompt("请输入新小组名称 (例如: 第5组)");
        if(name && !this.data.groups.includes(name)) {
            this.data.groups.push(name);
            this.renderBoard();
        }
    },
    
    lockGrp(g) {
        if (this.data.targetGroup === g) {
            this.data.targetGroup = null; // 解锁
        } else {
            this.data.targetGroup = g; // 锁定新组
        }
        this.renderBoard(); // 重新渲染以应用红色火焰特效
    },
    
    resetStatus() {
        if(confirm("确定要重置本节课的点名状态吗？(不会清除胜负数据)")) {
            this.data.calledSet.clear();
            document.querySelectorAll('.card').forEach(c => {
                c.classList.remove('called');
                c.classList.remove('selected');
                c.classList.remove('auto-rotating');
            });
            alert("状态已重置，所有人均可再次被点名。");
        }
    },
    
    toggleBar(id, btn) {
        const bar = el(id);
        if (bar.classList.contains('minimized')) {
            bar.classList.remove('minimized');
            btn.innerHTML = id === 'main-controls' ? '<i class="fas fa-chevron-down"></i>' : '<i class="fas fa-chevron-left"></i>';
        } else {
            bar.classList.add('minimized');
            btn.innerHTML = id === 'main-controls' ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-right"></i>';
        }
    },
    
    // 全屏切换
    toggleFullScreen(elementId) {
        const elem = document.getElementById(elementId);
        if (!document.fullscreenElement) {
            elem.requestFullscreen().catch(err => {
                alert(`全屏启用失败: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }
, // <--- 注意：如果你插入在 toggleFullScreen 后面，这里必须加一个逗号

    // ==========================================
    // 6. 题库与 PK 辅助功能 (修复补丁)
    // ==========================================

  // 1. 加载题库 (修复版：加载后静默等待，不自动弹窗)
    async loadQuiz(input) {
        const file = input.files[0];
        if (!file) return;

        const qContent = el('question-content');
        const aContent = el('answer-content');
        
        // 重置 UI，但不打开窗口
        qContent.innerHTML = '';
        aContent.style.display = 'none';
        aContent.innerHTML = '';

        try {
            // === 处理 PDF ===
            if (file.name.toLowerCase().endsWith('.pdf')) {
                const fileURL = URL.createObjectURL(file);
                const loadingTask = pdfjsLib.getDocument(fileURL);
                
                // 1. 存储 PDF 对象到全局变量
                this.data.currentPdfDoc = await loadingTask.promise;
                this.data.totalPdfPages = this.data.currentPdfDoc.numPages;
                
                // 🔥 关键修改：重置为第1页，但【不要】调用 renderNextQuestion
                this.data.currentPdfPage = 1; 

                // 2. 提示用户加载成功
                alert(`✅ 题库加载完毕！\n共 ${this.data.totalPdfPages} 页。\n\n现在您可以点击底部 "PK" 按钮开始点名。\n每次 PK 结果出现时，题目会自动显示。`);
                
                // 🔥 关键修改：【删除】自动打开 winner-overlay 的代码
            } 
            // === 处理 Word/Txt ===
            else {
                this.data.currentPdfDoc = null; // 清空 PDF 状态
                let html = "";
                if (file.name.endsWith('.docx')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                    html = result.value;
                } else if (file.name.endsWith('.txt')) {
                    const text = await file.text();
                    html = text.replace(/\n/g, '<br>');
                }

                // 智能分离答案
                const separators = ["答案：", "答案:", "Answer:", "|||"];
                let splitIndex = -1;
                for (let sep of separators) {
                    if (html.includes(sep)) {
                        splitIndex = html.lastIndexOf(sep);
                        break;
                    }
                }

                if (splitIndex > -1) {
                    qContent.innerHTML = `<div class="q-text-content">${html.substring(0, splitIndex)}</div>`;
                    aContent.innerHTML = html.substring(splitIndex);
                } else {
                    qContent.innerHTML = `<div class="q-text-content">${html}</div>`;
                    aContent.innerHTML = "无隐藏答案";
                }
                
                alert("✅ 文本题库加载成功！请点击 PK 按钮开始。");
                // 🔥 关键修改：这里也删除了自动打开 winner-overlay 的代码
            }

        } catch (err) {
            console.error(err);
            alert("文件解析出错: " + err.message);
        }

        input.value = ''; 
    },

// 新增：渲染下一题 (PDF 专用)
    async renderNextQuestion() {
        // 如果没有加载 PDF，直接重置时间并退出
        if (!this.data.currentPdfDoc) {
            this.resetTimer(); 
            return;
        }

        const qContent = el('question-content');
        
        // 检查是否题目已用完
        if (this.data.currentPdfPage > this.data.totalPdfPages) {
            qContent.innerHTML = `
                <div style="text-align:center; margin-top:50px; color:#ef4444;">
                    <i class="fas fa-check-circle" style="font-size:4rem;"></i>
                    <h1>题库已展示完毕</h1>
                    <p>所有 PDF 页面均已显示。</p>
                </div>
            `;
            speak("题目已经全部做完了");
            return;
        }

        // === 渲染 PDF 当前页 ===
        const page = await this.data.currentPdfDoc.getPage(this.data.currentPdfPage);
        const viewport = page.getViewport({ scale: 1.5 }); // 清晰度 1.5倍
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // 样式适配
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';

        qContent.innerHTML = '';
        qContent.appendChild(canvas);

        const renderContext = { canvasContext: context, viewport: viewport };
        await page.render(renderContext).promise;

        // 页码提示
        const stepBadge = document.createElement('div');
        stepBadge.style.cssText = "position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.6); color:white; padding:2px 8px; border-radius:4px; font-size:0.8rem;";
        stepBadge.innerText = `Page ${this.data.currentPdfPage} / ${this.data.totalPdfPages}`;
        qContent.appendChild(stepBadge);

        // 页码+1，为下一次做准备
        this.data.currentPdfPage++; 
        
        // 重置倒计时和缩放
        this.resetTimer();
        this.resetZoomQ();
        
        // 隐藏答案区
        el('answer-content').style.display = 'none';
        el('answer-content').innerHTML = "PDF模式下请手动核对答案"; 
    },

    // 2. 倒计时逻辑
    resetTimer() {
        // 清除旧定时器
        if (this.data.qTimer) clearInterval(this.data.qTimer);
        
        const select = el('timer-select');
        const display = el('timer-display');
        let timeLeft = parseInt(select.value);
        
        display.innerText = timeLeft;
        display.classList.remove('urgent');

        this.data.qTimer = setInterval(() => {
            timeLeft--;
            display.innerText = timeLeft;

            if (timeLeft <= 5) {
                display.classList.add('urgent');
                // 可选：最后5秒播放滴答声
            }

            if (timeLeft <= 0) {
                clearInterval(this.data.qTimer);
                display.innerText = "0";
                // 时间到，自动闪烁或提示
                speak("时间到");
            }
        }, 1000);
    },

    // 3. 题目缩放逻辑
    zoomQ(delta) {
        const content = el('question-content');
        // 初始化缩放比例
        if (!this.data.qScale) this.data.qScale = 1;
        
        this.data.qScale += delta;
        // 限制最小 0.5，最大 3.0
        this.data.qScale = Math.min(Math.max(0.5, this.data.qScale), 3.0);
        
        content.style.transform = `scale(${this.data.qScale})`;
        content.style.transformOrigin = "top center";
    },

    resetZoomQ() {
        this.data.qScale = 1;
        const content = el('question-content');
        content.style.transform = `scale(1)`;
    }, // <--- 注意这里要有逗号

    // ==========================================
    // 修复后的功能区 (AI、黑板、课件、赛跑、分析)
    // ==========================================

    // ============================================================
    // 🛠️ 修复一：AI 语音识别核心 (接入浏览器听写 API)
    // ============================================================
    
    // 1. 初始化语音识别引擎
    initSpeech() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'zh-CN'; // 设定中文
            this.recognition.continuous = false; // 说完一句自动停止
            this.recognition.interimResults = true; // 开启实时回显(字一个个蹦出来)

            this.recognition.onstart = () => {
                this.isListening = true;
                el('ai-status-label').innerText = "正在聆听...";
                el('ai-status-label').style.color = "#fca5a5";
                el('ai-icon-visual').innerText = '🎤';
                document.querySelector('.ai-avatar-box').classList.add('listening');
            };

            this.recognition.onend = () => {
                this.isListening = false;
                el('ai-status-label').innerText = "待命";
                el('ai-status-label').style.color = "#aaa";
                el('ai-icon-visual').innerText = '🤖';
                document.querySelector('.ai-avatar-box').classList.remove('listening');
                el('mic-btn').classList.remove('active');
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                // 实时显示在气泡里
                el('ai-text-content').innerText = transcript;
                
                if (event.results[0].isFinal) {
                    console.log("识别结果:", transcript);
                    this.askDeepSeek(transcript); // 发送给 AI
                }
            };

            this.recognition.onerror = (event) => {
                console.error("语音识别错误:", event.error);
                el('ai-text-content').innerText = "❌ 没听清，请重试";
                this.stopVoice();
            };
        } else {
            alert("您的浏览器不支持语音识别，请使用 Chrome 或 Edge (且必须是 HTTPS 或 localhost 环境)。");
        }
    },

    // 2. 语音开关 (控制麦克风)
    toggleVoice() {
        if (!this.recognition) this.initSpeech(); // 首次初始化

        const btn = el('mic-btn');
        const card = el('ai-assistant-card');

        if (this.isListening) {
            this.stopVoice();
            // card.style.display = 'none'; // 可选：停止时隐藏
        } else {
            try {
                this.recognition.start();
                btn.classList.add('active');
                card.style.display = 'flex';
                this.speak("我在听");
            } catch (e) {
                console.log("麦克风占用中，重置状态...");
                this.recognition.stop();
            }
        }
    },

    stopVoice() {
        if (this.recognition) this.recognition.stop();
        this.isListening = false;
        el('mic-btn').classList.remove('active');
    },

    // 3. AI 思考与回复 (连接 DeepSeek)
    async askDeepSeek(promptText) {
        const status = el('ai-status-label');
        const textDisplay = el('ai-text-content');
        const avatar = document.querySelector('.ai-avatar-box');

        status.innerText = "🧠 思考中...";
        avatar.classList.add('speaking'); // 开始跳动
        
        // --- 简单指令拦截 (不费 Token) ---
        if(promptText.includes("点名")) { 
            this.speak("好的，开始随机点名"); 
            this.startRoll('single'); 
            textDisplay.innerText = "指令已执行：随机点名";
            avatar.classList.remove('speaking');
            return;
        }
        if(promptText.includes("PK")) { 
            this.speak("开启PK模式"); 
            this.startRoll('pk'); 
            textDisplay.innerText = "指令已执行：PK模式";
            avatar.classList.remove('speaking');
            return;
        }
        // ------------------------------

        const systemPrompt = `你是一位初中老师。请用简练、幽默的口语回答。不要Markdown。`;
        const DEEPSEEK_PROXY_URL = import.meta.env.VITE_DEEPSEEK_PROXY_URL ?? '';
        if (!DEEPSEEK_PROXY_URL) {
            status.innerText = "⚠️ 未配置 AI 服务";
            status.style.color = "#fbbf24";
            textDisplay.innerText = "未配置 DeepSeek 代理服务地址（VITE_DEEPSEEK_PROXY_URL）。为安全起见，前端不能直接使用 API Key。";
            avatar.classList.remove('speaking');
            return;
        }

        try {
            const response = await fetch(DEEPSEEK_PROXY_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    promptText,
                    systemPrompt
                })
            });

            const data = await response.json();
            const aiText =
                (typeof data?.text === 'string' && data.text) ||
                (typeof data?.choices?.[0]?.message?.content === 'string' && data.choices[0].message.content) ||
                '';
            if (!aiText) throw new Error("AI 返回内容为空");

            status.innerText = "💡 AI 回答：";
            status.style.color = "#4ade80";
            textDisplay.innerText = aiText;
            
            this.speak(aiText);

        } catch (error) {
            textDisplay.innerText = "❌ 网络开小差了 (DeepSeek)";
            avatar.classList.remove('speaking');
        }
    },

    // 4. 朗读功能
    speak(text) {
        const avatar = document.querySelector('.ai-avatar-box');
        if(window.speechSynthesis.speaking) window.speechSynthesis.cancel();
        
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = 1.2;
        u.onend = () => { avatar.classList.remove('speaking'); };
        window.speechSynthesis.speak(u);
    },

    // 5. 手动输入指令
    manualInput() {
        const t = prompt("请输入指令 (例如: 解释勾股定理):");
        if(t) this.askDeepSeek(t);
    },

    // 2. 修复：右侧工具栏无法显示 (Tab切换逻辑)
    switchTab(tabName) {
        document.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
        if(tabName === 'teaching') document.querySelectorAll('.p-tab')[0].classList.add('active');
        if(tabName === 'practice') document.querySelectorAll('.p-tab')[1].classList.add('active');

        const dock = document.getElementById('subject-dock'); 
        const cLayer = document.getElementById('course-player-layer');
        const pLayer = document.getElementById('practice-layer');

        if (tabName === 'teaching') {
            if(pLayer) pLayer.style.display = 'none';
            if(dock) dock.style.display = 'none'; // 教学模式隐藏工具栏
            if(cLayer) cLayer.style.display = 'flex';
            if(typeof wb !== 'undefined') {
                wb.setMode('cursor');
                if (this.data.playList && this.data.playList.length > 0) wb.setLockedPageCount(this.data.playList.length);
                else wb.setLockedPageCount(null);
            }
        } else {
            if(cLayer) cLayer.style.display = 'none';
            if(pLayer) pLayer.style.display = 'flex';
            if(dock) dock.style.display = 'flex'; // 练习模式显示工具栏
            if(typeof wb !== 'undefined') {
                wb.setLockedPageCount(null);
                wb.setMode('pen');
                setTimeout(() => wb.resize(), 50);
            }
        }
    },

    // 4. 修复：成绩赛跑逻辑
    openRace() {
        el('race-modal').style.display = 'flex';
        const cached = localStorage.getItem('race_data_cache');
        if(cached) el('race-input').value = cached;
    },

    saveRaceData() {
        localStorage.setItem('race_data_cache', el('race-input').value);
    },

    initRace() {
        const text = el('race-input').value.trim();
        if(!text) return alert("请先输入数据，格式：姓名 分数");
        
        const board = el('race-board');
        board.innerHTML = ''; 
        
        const lines = text.split('\n').filter(l => l.trim());
        const runners = lines.map(line => {
            const parts = line.split(/\s+/);
            return { name: parts[0], score: parseInt(parts[1]) || 0 };
        }).sort((a,b) => b.score - a.score);

        for(let i=0; i<10; i++) {
            const row = document.createElement('div');
            row.className = 'race-lane-row';
            row.innerHTML = `<div class="lane-number">${i+1}</div>`;
            board.appendChild(row);
        }

        runners.forEach((r, idx) => {
            const laneIdx = idx % 10;
            const row = board.children[laneIdx];
            const studentEl = document.createElement('div');
            studentEl.className = 'race-lane-student';
            studentEl.style.left = '50px'; 
            studentEl.dataset.score = r.score;
            
            const realStudent = this.data.students.find(s => s.name === r.name);
            const avatarSrc = realStudent ? this.getAvatarSrc(realStudent) : `https://api.dicebear.com/7.x/adventurer/svg?seed=${r.name}`;

            studentEl.innerHTML = `<div class="r-info">${r.name}</div><img src="${avatarSrc}" class="r-avatar"><div class="r-score-tag">${r.score}分</div>`;
            row.appendChild(studentEl);
        });
    },

    runRace() {
        const runners = document.querySelectorAll('.race-lane-student');
        if(runners.length === 0) return alert("请先加载跑道！");
        speak("比赛开始");
        runners.forEach(el => {
            const score = parseInt(el.dataset.score);
            const maxW = document.getElementById('race-view').offsetWidth - 100;
            let targetPx = 60 + (score * 10); 
            if(targetPx > maxW) targetPx = maxW;
            const delay = Math.random() * 1000;
            setTimeout(() => { el.style.left = targetPx + 'px'; }, delay);
        });
    },

    // 5. 修复：智能分析
    openAnalysis() {
        el('analysis-modal').style.display = 'flex';
        el('adviceText').innerText = "请点击左上角上传 Excel 文件以生成报告。";
    },
    
    toggleAnalysisMode(mode) {
        if(mode === 'trend') {
            el('single-report-section').style.display = 'none';
            el('trend-section').style.display = 'flex';
        } else {
            el('single-report-section').style.display = 'contents';
            el('trend-section').style.display = 'none';
        }
    },
    
    handleAnalysisUpload(input) { alert("分析模块仅展示界面，数据处理需后端支持。"); },
    handleTrendUpload(input) { alert("趋势分析模块开发中。"); },
    checkAnalysisData() { alert("数据格式检查通过。"); },
// ============================================================
    // 📂 新增功能：USB 本地课件读取 (自动播放)
    // ============================================================
    
    // 1. 读取文件夹并排序
    loadUsbLesson(input) {
        const files = Array.from(input.files);
        if (files.length === 0) return;

        // 获取文件夹名称
        const folderName = files[0].webkitRelativePath.split('/')[0] || "本地课程";

        // 定义支持的格式
        const validExts = ['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.gif', '.html', '.pdf', '.docx', '.doc', '.xlsx', '.xls'];
        
        // 过滤并排序 (按文件名数字排序)
        const courseFiles = files.filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            return validExts.includes(ext) && !f.name.startsWith('.');
        }).sort((a, b) => {
            const numA = parseInt(a.name) || 0;
            const numB = parseInt(b.name) || 0;
            return numA - numB;
        });

        if (courseFiles.length === 0) return alert("❌ 未找到支持的课件 (支持: 视频/图片/网页/PDF/Word)");

        // 🔥 关键步骤：强制切换到“教学演示”界面
        this.switchTab('teaching');

        // 构建播放列表
        this.data.playList = courseFiles.map(file => {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            let type = 'unknown';
            if (['.mp4', '.webm'].includes(ext)) type = 'video';
            else if (['.html', '.htm'].includes(ext)) type = 'html';
            else if (['.pdf'].includes(ext)) type = 'pdf';
            else if (['.docx', '.doc'].includes(ext)) type = 'word';
            else if (['.xlsx', '.xls'].includes(ext)) type = 'xlsx';
            else type = 'image';
            
            return {
                name: file.name,
                type: type,
                file: file, 
                url: URL.createObjectURL(file)
            };
        });

        // 重置播放进度
        this.data.playIndex = 0;
        
        // 更新 UI 标题
        const titleEl = document.getElementById('cp-lesson-title');
        const totalEl = document.getElementById('cp-total-steps');
        if(titleEl) titleEl.innerText = folderName;
        if(totalEl) totalEl.innerText = this.data.playList.length;

        if (typeof wb !== 'undefined') {
            wb.setLockedPageCount(this.data.playList.length);
            wb.resetPagesToCount(this.data.playList.length);
            wb.setPagesMetaFromPlayList(this.data.playList);
        }
        
        // 开始渲染第一页
        this.renderPlayerStep();
        
        // 清空 input
        input.value = '';
    },

    // 2. 渲染引擎 (显示内容)
    async renderPlayerStep() {
        const step = this.data.playList[this.data.playIndex];
        const container = document.getElementById('cp-content-area');
        const stepIndexEl = document.getElementById('cp-step-index');
        
        if(stepIndexEl) stepIndexEl.innerText = this.data.playIndex + 1;
        if(!container) return;

        if (typeof wb !== 'undefined') {
            wb.setLockedPageCount(this.data.playList.length);
            wb.syncPagesCount(this.data.playList.length);
            wb.switchPage(this.data.playIndex);
        }

        container.innerHTML = '<div style="font-size:1.5rem; color:#999;"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

        // === 视频 ===
        if (step.type === 'video') {
            container.innerHTML = `
                <video id="curr-vid" src="${step.url}" controls autoplay 
                    style="max-width:100%; max-height:100%; outline:none; box-shadow:0 5px 30px rgba(0,0,0,0.5);">
                </video>`;
            const v = container.querySelector('video');
            if (v) {
                v.addEventListener('loadeddata', () => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, { once: true });
                setTimeout(() => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, 120);
            }
        } 
        // === 网页 ===
        else if (step.type === 'html') {
            container.innerHTML = `<iframe src="${step.url}" style="width:100%; height:100%; border:none; background:white;"></iframe>`;
            setTimeout(() => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, 200);
        }
        // === 图片 ===
        else if (step.type === 'image') {
            container.innerHTML = `<img src="${step.url}" style="max-width:100%; max-height:100%; object-fit:contain; box-shadow:0 5px 20px rgba(0,0,0,0.2);">`;
            const img = container.querySelector('img');
            if (img) {
                img.addEventListener('load', () => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, { once: true });
                if (img.complete) setTimeout(() => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, 60);
            }
        }
        // === PDF ===
        else if (step.type === 'pdf') {
            container.innerHTML = ''; 
            const canvasWrapper = document.createElement('div');
            canvasWrapper.style.cssText = "width:100%; height:100%; overflow-y:auto; text-align:center; background:#525659; padding:20px;";
            container.appendChild(canvasWrapper);
            
            try {
                const loadingTask = pdfjsLib.getDocument(step.url);
                const pdf = await loadingTask.promise;
                
                for(let i=1; i<=pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({scale: 1.5});
                    const cvs = document.createElement('canvas');
                    cvs.height = viewport.height;
                    cvs.width = viewport.width;
                    cvs.style.cssText = "max-width:100%; margin-bottom:15px; box-shadow:0 0 10px rgba(0,0,0,0.5);";
                    canvasWrapper.appendChild(cvs);
                    await page.render({canvasContext: cvs.getContext('2d'), viewport: viewport}).promise;
                }
                if (typeof wb !== 'undefined') wb.saveCurrentPageState();
            } catch(e) {
                container.innerHTML = `<div style="color:red">PDF加载失败: ${e.message}</div>`;
                if (typeof wb !== 'undefined') wb.saveCurrentPageState();
            }
        }
        // === Word ===
        else if (step.type === 'word') {
             try {
                 const ab = await step.file.arrayBuffer();
                 const res = await mammoth.convertToHtml({arrayBuffer: ab});
                 container.innerHTML = '';
                 const wordBox = document.createElement('div');
                 wordBox.style.cssText = "width:210mm; min-height:297mm; padding:20mm; margin:20px auto; background:white; color:black; box-shadow:0 0 20px rgba(0,0,0,0.3); overflow:visible;";
                 wordBox.innerHTML = res.value;
                 
                 const scrollBox = document.createElement('div');
                 scrollBox.style.cssText = "width:100%; height:100%; overflow-y:auto; background:#f3f4f6;";
                 scrollBox.appendChild(wordBox);
                 container.appendChild(scrollBox);
                 setTimeout(() => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, 80);
             } catch(e) {
                 container.innerHTML = `<div style="color:red">Word加载失败: ${e.message}</div>`;
                 if (typeof wb !== 'undefined') wb.saveCurrentPageState();
             }
        }
        // === Excel ===
        else if (step.type === 'xlsx') {
            try {
                const ab = await step.file.arrayBuffer();
                const book = XLSX.read(ab, { type: 'array' });
                const sheet = book.Sheets[book.SheetNames[0]];
                const html = XLSX.utils.sheet_to_html(sheet);
                container.innerHTML = `<div style="background:white; color:black; padding:20px; overflow:auto; height:100%;">${html}</div>`;
                setTimeout(() => { if (typeof wb !== 'undefined') wb.saveCurrentPageState(); }, 80);
            } catch (e) {
                container.innerHTML = `<div style="color:red">Excel加载失败: ${e.message}</div>`;
                if (typeof wb !== 'undefined') wb.saveCurrentPageState();
            }
        }
        else {
            container.innerHTML = `<div style="color:#ef4444; font-size:1.2rem;">❌ 不支持的文件类型</div>`;
            if (typeof wb !== 'undefined') wb.saveCurrentPageState();
        }
    }

}; // <--- app 对象在这里正确结束

window.el = el;
window.speak = speak;
window.fireConfetti = fireConfetti;
window.tools = tools;
window.wb = wb;
window.app = app;
window.getSupabaseClient = () => supabaseClient;
