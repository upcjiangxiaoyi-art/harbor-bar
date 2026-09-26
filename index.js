const {
    eventSource,
    event_types,
    getCurrentChatId,
    renameChat,
    getRequestHeaders,
    openGroupChat,
    openCharacterChat,
    executeSlashCommandsWithOptions,
    Popup,
} = SillyTavern.getContext();
import { addJQueryHighlight } from './jquery-highlight.js';
import { getGroupPastChats } from '../../../group-chats.js';
import { getPastCharacterChats, animation_duration, animation_easing, getGeneratingApi } from '../../../../script.js';
import { debounce, timestampToMoment, sortMoments, uuidv4, waitUntilCondition } from '../../../utils.js';
import { debounce_timeout } from '../../../constants.js';
import { t } from '../../../i18n.js';

const movingDivs = /** @type {HTMLDivElement} */ (document.getElementById('movingDivs'));
const sheld = /** @type {HTMLDivElement} */ (document.getElementById('sheld'));
const chat = /** @type {HTMLDivElement} */ (document.getElementById('chat'));
const draggableTemplate = /** @type {HTMLTemplateElement} */ (document.getElementById('generic_draggable_template'));
const apiBlock = /** @type {HTMLDivElement} */ (document.getElementById('rm_api_block'));

const topBar = document.createElement('div');
const chatName = document.createElement('select');
const searchInput = document.createElement('input');
const harborDock = document.createElement('div');

/* ========================================================================
 * 避风塘 Harbor Bar —— 浮窗停车场
 * 车位名单：满屏漂的浮标凭此入库。新插件的浮标想进港，在这里加一行即可。
 * 二改：波哥（Fable 5）× ripple ｜ 原作：Cohee1207 (SillyTavern)
 * ======================================================================== */
const HARBOR_REGISTRY = [
    { selector: '#adr048-fab', name: 'Arrebol D 小红霞' },
    { selector: '#ipe-chat-quick-entry', name: 'IPE 小海螺' },
    { selector: '#lcl2_floater', name: 'Luciole 小萤火 2.0' },
];
const connectionProfiles = document.createElement('div');
const connectionProfilesStatus = document.createElement('div');
const connectionProfilesSelect = document.createElement('select');
const connectionProfilesIcon = document.createElement('img');

const icons = [
    {
        id: 'extensionTopBarToggleSidebar',
        icon: 'fa-fw fa-solid fa-box-archive',
        position: 'left',
        title: t`Toggle sidebar`,
        onClick: onToggleSidebarClick,
    },
    {
        id: 'extensionTopBarToggleConnectionProfiles',
        icon: 'fa-fw fa-solid fa-plug',
        position: 'left',
        title: t`Show connection profiles`,
        isTemporaryAllowed: true,
        onClick: onToggleConnectionProfilesClick,
    },
    {
        id: 'extensionTopBarChatManager',
        icon: 'fa-fw fa-solid fa-address-book',
        position: 'right',
        title: t`View chat files`,
        isTemporaryAllowed: true,
        onClick: onChatManagerClick,
    },
    {
        id: 'extensionTopBarNewChat',
        icon: 'fa-fw fa-solid fa-comments',
        position: 'right',
        title: t`New chat`,
        isTemporaryAllowed: true,
        onClick: onNewChatClick,
    },
    {
        id: 'extensionTopBarRenameChat',
        icon: 'fa-fw fa-solid fa-edit',
        position: 'right',
        title: t`Rename chat`,
        onClick: onRenameChatClick,
    },
    {
        id: 'extensionTopBarDeleteChat',
        icon: 'fa-fw fa-solid fa-trash',
        position: 'right',
        title: t`Delete chat`,
        onClick: async () => {
            const confirm = await Popup.show.confirm(t`Are you sure?`);
            if (confirm) {
                await executeSlashCommandsWithOptions('/delchat');
            }
        },
    },
    {
        id: 'extensionTopBarCloseChat',
        icon: 'fa-fw fa-solid fa-times',
        position: 'right',
        title: t`Close chat`,
        isTemporaryAllowed: true,
        onClick: onCloseChatClick,
    },
];

function onChatManagerClick() {
    document.getElementById('option_select_chat')?.click();
}

function onCloseChatClick() {
    document.getElementById('option_close_chat')?.click();
}

function onNewChatClick() {
    document.getElementById('option_start_new_chat')?.click();
}

async function onRenameChatClick() {
    const currentChatName = getCurrentChatId();

    if (!currentChatName) {
        return;
    }

    const newChatName = await Popup.show.input(t`Enter new chat name`, null, currentChatName);

    if (!newChatName || newChatName === currentChatName) {
        return;
    }

    await renameChat(currentChatName, String(newChatName));
}

function patchSheldIfNeeded() {
    // Fun fact: sheld is a typo. It should be shell.
    // It was fixed in OG TAI long ago, but we still have it here.
    if (!sheld) {
        console.error('Sheld not found. Did you finally rename it?');
        return;
    }

    const computedStyle = getComputedStyle(sheld);
    // Alert: We're not in a version that switched sheld to flex yet.
    if (computedStyle.display === 'grid') {
        sheld.classList.add('flexPatch');
    }
}

function setChatName(name) {
    const isNotInChat = !name;
    chatName.innerHTML = '';
    const selectedOption = document.createElement('option');
    selectedOption.innerText = name || t`No chat selected`;
    selectedOption.selected = true;
    chatName.appendChild(selectedOption);
    chatName.disabled = true;

    icons.forEach(icon => {
        const iconElement = document.getElementById(icon.id);
        if (iconElement && !icon.isTemporaryAllowed) {
            iconElement.classList.toggle('not-in-chat', isNotInChat);
        }
    });

    if (!isNotInChat && typeof openGroupChat === 'function' && typeof openCharacterChat === 'function') {
        setTimeout(async () => {
            const list = [];
            const context = SillyTavern.getContext();
            if (context.groupId) {
                const group = context.groups.find(x => x.id == context.groupId);
                if (group) {
                    list.push(...group.chats);
                }
            }
            else {
                const characterAvatar = context.characters[context.characterId]?.avatar;
                list.push(...await getListOfCharacterChats(characterAvatar));
            }

            if (list.length > 0) {
                chatName.innerHTML = '';
                list.sort((a, b) => a.localeCompare(b)).forEach((x) => {
                    const option = document.createElement('option');
                    option.innerText = x;
                    option.value = x;
                    option.selected = x === name;

                    chatName.appendChild(option);
                });
                chatName.disabled = false;
            }

            await populateSideBar();
        }, 0);
    }

    if (isNotInChat) {
        setTimeout(() => populateSideBar(), 0);
    }
}

/**
 * Get list of chat names for a character.
 * @param {string} avatar Avatar name of the character
 * @returns {Promise<string[]>} List of chat names
 */
async function getListOfCharacterChats(avatar) {
    try {
        const result = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: avatar, simple: true }),
        });

        if (!result.ok) {
            return [];
        }

        const data = await result.json();
        return data.map(x => String(x.file_name).replace('.jsonl', ''));
    } catch (error) {
        console.error('Failed to get list of character chats', error);
        return [];
    }
}

async function getChatFiles() {
    const context = SillyTavern.getContext();
    const chatId = getCurrentChatId();

    if (!chatId) {
        return [];
    }

    if (context.groupId) {
        return await getGroupPastChats(context.groupId);
    }

    if (context.characterId !== undefined) {
        return await getPastCharacterChats(context.characterId);
    }

    return [];
}

/**
 * Highlight search query in chat messages
 * @param {string} query Search query
 * @returns {void}
 */
function searchInChat(query) {
    const options = { element: 'mark', className: 'highlight' };
    const messages = jQuery(chat).find('.mes_text');
    messages.unhighlight(options);
    if (!query) {
        return;
    }
    const splitQuery = query.split(/\s|\b/);
    messages.highlight(splitQuery, options);
}

const searchDebounced = debounce((x) => searchInChat(x), 500);
const updateStatusDebounced = debounce(onOnlineStatusChange, 1000);

function addTopBar() {
    chatName.id = 'extensionTopBarChatName';
    topBar.id = 'extensionTopBar';
    searchInput.id = 'extensionTopBarSearchInput';
    searchInput.placeholder = 'Search...';
    searchInput.classList.add('text_pole', 'harborCollapsed');
    searchInput.type = 'search';
    searchInput.addEventListener('input', () => searchDebounced(searchInput.value.trim()));

    harborDock.id = 'extensionHarborDock';

    const searchToggle = document.createElement('i');
    searchToggle.id = 'extensionHarborSearchToggle';
    searchToggle.className = 'fa-fw fa-solid fa-magnifying-glass';
    searchToggle.title = t`Search in chat`;
    searchToggle.tabIndex = 0;
    searchToggle.classList.add('right_menu_button');
    // v1.1.3 架构级修复：收起不再依赖点中图标。
    // 输入框失焦（键盘收起/点了别处）→ 自动收起，绕开 iOS 所有点击吞噬问题。
    // 收起时保留搜索词和高亮，方便收起后阅读命中结果；要清除高亮就
    // 重新展开用输入框自带的 ✕ 清空。120ms 延迟让图标切换先行结算。
    searchInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!searchInput.classList.contains('harborCollapsed')) {
                searchInput.classList.add('harborCollapsed');
                searchToggle.classList.remove('active');
            }
        }, 120);
    });

    // 图标开关保留作为备用门。iOS 会对同一次点击补发多个事件
    // （pointerdown/touchend/click，间隔可达数百毫秒），600ms 内只认第一发。
    let harborLastToggle = 0;
    function harborToggleSearch(ev) {
        ev.preventDefault();
        const now = Date.now();
        if (now - harborLastToggle < 600) return;
        harborLastToggle = now;
        const collapsed = searchInput.classList.toggle('harborCollapsed');
        searchToggle.classList.toggle('active', !collapsed);
        if (!collapsed) {
            searchInput.focus();
        }
    }
    searchToggle.addEventListener('pointerdown', harborToggleSearch);
    searchToggle.addEventListener('touchend', harborToggleSearch, { passive: false });
    searchToggle.addEventListener('click', harborToggleSearch);

    harborDock.append(searchToggle, searchInput);
    topBar.append(chatName, harborDock);
    sheld.insertBefore(topBar, chat);
}

/* ===================== 避风塘泊车核心 ===================== */

/**
 * 给入库浮标换上泊位制服：剥掉 fixed 定位与巨型阴影，压成栏内小胶囊。
 * 全部用 !important 写入，压过原插件创建时的行内 !important。
 * @param {HTMLElement} el 浮标元素
 */
function harborApplyParkedStyle(el) {
    const imp = (k, v) => { try { el.style.setProperty(k, v, 'important'); } catch { el.style[k] = v; } };
    imp('position', 'static');
    imp('left', 'auto');
    imp('top', 'auto');
    imp('right', 'auto');
    imp('bottom', 'auto');
    imp('width', 'auto');
    imp('min-width', 'auto');
    imp('height', '20px');
    imp('min-height', '20px');
    imp('line-height', '20px');
    imp('padding', '0 3px');
    imp('font-size', '11px');
    try { el.style.boxShadow = 'none'; } catch {} // 不带 important：给泊内脉冲动画让路
    imp('z-index', 'auto');
    imp('margin', '0');
    imp('transform', 'none');
    imp('cursor', 'pointer');
    imp('touch-action', 'manipulation');
    imp('flex', 'none');
    // v1.3.0 车宽封顶（军规由江提出）：浮标工作态会加宽自己（闪灯/换徽章），
    // 泊内一律封顶——多出来的裁掉，灯照样闪，位置不许多占。
    // 注意不钉 display：打字让位规则（CSS 层）需要临时藏车。
    imp('opacity', '1');
    imp('visibility', 'visible');
    imp('max-width', '88px');
    imp('max-height', '20px');
    imp('overflow', 'hidden');
    imp('pointer-events', 'auto');
}

/**
 * 泊位制服有没有被原插件的看门狗扒掉（它们会重刷行内样式）。
 * @param {HTMLElement} el 浮标元素
 * @returns {boolean} true = 制服还在
 */
function harborStyleIntact(el) {
    // v1.3.0：不查 display——打字让位时车队合法隐身，查了会自己打自己。
    return el.style.position === 'static'
        && el.style.height === '20px'
        && el.style.maxWidth === '88px'
        && el.style.opacity === '1'
        && el.style.visibility === 'visible'
        && el.parentElement === harborDock;
}

/**
 * 巡港一次：把名单上已出现、还没入库的浮标收编进 dock。
 * 原浮标不销毁不隐藏——本体挪进泊位，原插件的看门狗查户口时元素仍在，不会重造。
 * 点击行为不动：各家浮标自己的开面板逻辑原样生效。
 */
function harborParkFloaters() {
    for (const car of HARBOR_REGISTRY) {
        const el = /** @type {HTMLElement} */ (document.querySelector(car.selector));
        if (!el) {
            continue;
        }
        if (el.dataset.harborParked === '1') {
            // v1.2.3 兜底：车牌还在但车被原插件拖出泊位（重挂到 body 等），抓回来。
            if (el.parentElement !== harborDock) {
                harborDock.appendChild(el);
                harborApplyParkedStyle(el);
            }
            continue;
        }
        el.dataset.harborParked = '1';
        el.title = car.name;
        harborDock.appendChild(el);
        harborApplyParkedStyle(el);

        // style 哨兵：原插件重刷行内样式时，把泊位制服再穿回去。
        // 制服完好时不动手，避免和自己的写入互相触发死循环。
        const sentinel = new MutationObserver(() => {
            if (!harborStyleIntact(el)) {
                harborApplyParkedStyle(el);
            }
        });
        sentinel.observe(el, { attributes: true, attributeFilter: ['style'] });
    }
}

const harborParkDebounced = debounce(() => harborParkFloaters(), debounce_timeout.short);

/**
 * v1.2.5 海面锚定：生成期的自动滚动会渗漏到根滚动条（iOS 浏览器通病），
 * 整张页面被拖着上滑，顶栏连车带港沉到浏览器工具栏后面。
 * 根滚动条对 ST 而言永远不该动：一动就压回去。
 * 唯一例外：正在输入时不出手——键盘弹出时浏览器要挪页面让输入框露头。
 */
function harborAnchorViewport() {
    const isEditing = () => {
        const ae = document.activeElement;
        return !!ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable);
    };
    const reset = () => {
        if (isEditing()) return;
        if (window.scrollY || document.documentElement.scrollTop) {
            window.scrollTo(0, 0);
        }
    };
    window.addEventListener('scroll', reset, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => setTimeout(reset, 50));
    }
    // 开锚先压一次，把可能已经歪掉的页面归位。
    reset();
}

/**
 * v1.3.3/1.3.4/1.3.6 叠层美化适配：有的美化把 #chat 改成绝对定位铺满 #sheld
 * （竟夕相思），有的把 #top-bar 加高垂到 #sheld 上面（梦胧灯），有的在顶栏
 * 伪元素上挂花边垂下来（Butterfly Teardrop），港口都会被压住。
 * 而 #sheld 自带 z-index:30 自成一层，#top-bar / #top-settings-holder 在
 * 它外面的 3005 层——港口待在 #sheld 里，z-index 给多高都翻不过去，
 * 看得见也点不着。所以探测到港口会被压住时，港口（连同连接面板）
 * 整个搬到 <body> 下，fixed 浮在 #top-bar 下沿；普通美化下原样搬回 #sheld。
 */
function harborAdaptLayout() {
    const topSettingsBar = document.getElementById('top-bar');
    // 变量写在 body 上：<html> 的 style 归 ST 主题色用，我们要监听它，不能自己也往上写。
    const root = document.body;
    // v1.3.12 「要不要浮」只在换美化时判一次（mode），缩放/键盘只更新坐标。
    // 以前每次 resize 都重判：iOS 弹键盘会把整页顶上去（编辑中锚点不归位），
    // 这时 #top-bar 钉在屏幕上不动、#sheld 被顶高，一量就误判成「顶栏垂下来」，
    // 普通美化里港口也浮起来、钉到被顶高的位置——吞掉抽屉标题栏，或者往下飘。
    let mode = null; // { overlay, chatDetached, buriedOffset }
    let modeDirty = true;
    let retryTimer = null;
    const retryLater = () => {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => applyDebounced(), 400);
    };
    // 页面被顶歪（键盘/iOS 滚动）或抽屉开着时量出来的数都不可信，等它归位再量。
    const pageShifted = () => !!(window.scrollY || document.documentElement.scrollTop || document.body.scrollTop);
    const drawerOpen = () => !!document.querySelector('#top-settings-holder .drawer-content.openDrawer');
    const apply = () => {
        // v1.3.5 底色随美化：照抄 #top-bar 的底色和毛玻璃。美化把顶栏做成
        // 透明，港口也透明；普通美化下两者本来就是同一个主题色，看不出变化。
        if (topSettingsBar) {
            const barStyle = getComputedStyle(topSettingsBar);
            root.style.setProperty('--harborBarBg', barStyle.backgroundColor);
            root.style.setProperty('--harborBarBackdrop', barStyle.backdropFilter || barStyle.webkitBackdropFilter || 'none');
        }
        if (pageShifted()) {
            retryLater();
            return;
        }
        const topBarVisible = !!topSettingsBar && getComputedStyle(topSettingsBar).display !== 'none';
        const topBarBottom = topBarVisible ? topSettingsBar.getBoundingClientRect().bottom : 0;
        if (modeDirty || !mode) {
            if (drawerOpen()) {
                retryLater();
                if (!mode) return;
            } else {
                // 需要浮起的三种情形：
                // ① #chat 被改成绝对定位铺满 #sheld（竟夕相思）；
                // ② #top-bar 被美化加高，垂下来盖住 #sheld 顶端（梦胧灯：顶栏 100px）。
                //    默认布局里 #top-bar 下沿不超过 #sheld 上沿，不会误判；
                // ③ 顶栏本体或伪元素花边压住港口（远方 / Butterfly），靠实地点测。
                const chatDetached = ['absolute', 'fixed'].includes(getComputedStyle(chat).position);
                const hangingTopBar = !chatDetached && topBarBottom - sheld.getBoundingClientRect().top > 2;
                const buriedClearY = chatDetached || hangingTopBar ? null : findTopBarDecorClearY();
                mode = {
                    overlay: chatDetached || hangingTopBar || buriedClearY !== null,
                    chatDetached,
                    // 存成相对 #sheld 上沿的偏移，之后 #sheld 挪动也能跟着走
                    buriedOffset: buriedClearY === null ? null : buriedClearY - sheld.getBoundingClientRect().top,
                };
                modeDirty = false;
            }
        }
        document.body.classList.toggle('harborOverlay', mode.overlay);
        if (!mode.overlay) {
            if (topBar.parentElement !== sheld) {
                sheld.insertBefore(topBar, chat);
                sheld.insertBefore(connectionProfiles, chat);
            }
            return;
        }
        if (topBar.parentElement !== document.body) {
            document.body.append(topBar, connectionProfiles);
        }
        const sheldRect = sheld.getBoundingClientRect();
        // ① 聊天区铺满：原位就在顶栏底下，得挪到 #top-bar 下沿。
        // ② 顶栏垂下来：加高的部分往往只有上半截有花边、下半截透明，
        //    贴 #top-bar 下沿会掉进空白里——留在原位（#sheld 上沿），只是层级浮到顶栏上面。
        // ③ 被压：按判定时量好的偏移放（本体盒子→原位；伪元素花边→花边下面）。
        let top = Math.max(0, sheldRect.top);
        if (mode.chatDetached) top = Math.max(top, topBarBottom);
        if (mode.buriedOffset !== null) top = Math.max(top, sheldRect.top + mode.buriedOffset);
        root.style.setProperty('--harborOverlayTop', `${Math.round(top)}px`);
        root.style.setProperty('--harborOverlayLeft', `${Math.round(sheldRect.left)}px`);
        root.style.setProperty('--harborOverlayWidth', `${Math.round(sheldRect.width)}px`);
        // v1.3.9 连接面板贴港口实际下沿，不靠公式推算：有的美化会给港口加 margin
        // （海盐可颂：margin-top 一个顶栏高），公式算不进去，面板就飞上去压住港口。
        root.style.setProperty('--harborProfilesTop', `${Math.round(topBar.getBoundingClientRect().bottom)}px`);
    };
    // ③ 顶栏的 ::before/::after 花边垂下来盖住港口（Butterfly Teardrop：60px 高的
    //    ::after 挂在 #top-bar 上）。伪元素量不到尺寸，干脆实地点一下：
    //    把港口放回原位，横着取几个点，看点中的是不是顶栏（伪元素的点击算在宿主头上）。
    //    只认 #top-bar / #top-settings-holder 本体，抽屉面板等不算，免得开着抽屉时误判。
    //    港口没被压 → null；被压 → 往下逐行探，返回花边盖不到的第一行 y。
    function findTopBarDecorClearY() {
        if (topBar.parentElement !== sheld) {
            sheld.insertBefore(topBar, chat);
            sheld.insertBefore(connectionProfiles, chat);
        }
        const rect = topBar.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        // 一行里有几个采样点点中顶栏。
        const coveredCount = (y) => [0.1, 0.3, 0.5, 0.7, 0.9].filter((fraction) => {
            const hit = document.elementFromPoint(rect.left + rect.width * fraction, y);
            if (!hit || topBar.contains(hit) || hit.closest('.drawer-content')) return false;
            return !!hit.closest('#top-bar, #top-settings-holder');
        }).length;
        const midY = rect.top + rect.height / 2;
        if (coveredCount(midY) === 0) return null;
        // v1.3.11 分两种压法：
        // · 被顶栏「本体盒子」盖住（远方：#top-settings-holder 本身 80px 高，背景图下半截
        //   是和页面融为一色的山水）→ 同梦胧灯，下半截多半是视觉留白，留在原位浮起即可；
        // · 被「伪元素」垂下来盖住（Butterfly：点中的是 #top-bar，但点位在它本体盒子之外）
        //   → 花边本身就是装饰，挪到它下面，别压字。
        const coveredByOwnBox = [0.1, 0.3, 0.5, 0.7, 0.9].some((fraction) => {
            const x = rect.left + rect.width * fraction;
            const hit = document.elementFromPoint(x, midY);
            const host = hit && !topBar.contains(hit) && hit.closest('#top-bar, #top-settings-holder');
            if (!host) return false;
            const box = host.getBoundingClientRect();
            return midY >= box.top && midY <= box.bottom && x >= box.left && x <= box.right;
        });
        if (coveredByOwnBox) return rect.top;
        // v1.3.13 往下探时至少 2 个点被压才算「这行还被花边盖着」。
        // Butterfly 还挂了个 ::before：背景图是空的（看不见），但占着右上角 90px 高的
        // 一条、点得到。旧规则「任一点被压就继续往下」被它一路拖到聊天区中间。
        // 窄条挡不住整行，浮起后港口本来就压在它上面，照样点得到。
        if (coveredCount(midY) < 2) return rect.top;
        let y = midY;
        const limit = Math.min(window.innerHeight / 2, rect.top + 300);
        while (y < limit && coveredCount(y) >= 2) y += 2;
        return y;
    }
    const applyDebounced = debounce(apply, 200);
    // 美化/主题变了 → 重新判定要不要浮；其余（缩放、键盘、顶栏变高）只更新坐标。
    const reclassify = () => {
        modeDirty = true;
        applyDebounced();
    };
    apply();
    // 换美化 = 改 <head> 里的 style。
    new MutationObserver(reclassify).observe(document.head, { childList: true, subtree: true, characterData: true });
    // 在设置面板里调主题色/毛玻璃，ST 改的是 <html> 的 style 和 body 的 class。
    // （我们自己只在 body 上 toggle 一个已是该值的 class 时不产生变动，不会自激。）
    const themeObserver = new MutationObserver(reclassify);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', applyDebounced);
    // 页面被顶歪后归位（锚点 scrollTo(0,0)）时补量一次。
    window.addEventListener('scroll', applyDebounced, { passive: true });
    if (typeof ResizeObserver === 'function') {
        const resizeObserver = new ResizeObserver(applyDebounced);
        resizeObserver.observe(sheld);
        resizeObserver.observe(topBar);
        if (topSettingsBar) resizeObserver.observe(topSettingsBar);
    }
}

/**
 * 开港：立即巡一次，再挂 body 观察员逮迟到的浮标
 * （ARB 的浮标最晚 4.2 秒后才创建，且设置开关可随时重造它们）。
 */
function harborInstallParking() {
    harborParkFloaters();
    const observer = new MutationObserver(() => harborParkDebounced());
    observer.observe(document.body, { childList: true, subtree: true });
}

function addIcons() {
    icons.forEach(icon => {
        const iconElement = document.createElement('i');
        iconElement.id = icon.id;
        iconElement.className = icon.icon;
        iconElement.title = icon.title;
        iconElement.tabIndex = 0;
        iconElement.classList.add('right_menu_button');
        iconElement.addEventListener('click', () => {
            if (iconElement.classList.contains('not-in-chat')) {
                return;
            }
            icon.onClick();
        });
        if (icon.position === 'left') {
            topBar.insertBefore(iconElement, chatName);
            return;
        }
        if (icon.position === 'right') {
            topBar.appendChild(iconElement);
            return;
        }
        if (icon.position === 'middle') {
            topBar.insertBefore(iconElement, searchInput);
            return;
        }
        if (icon.id === 'extensionTopBarRenameChat' && typeof renameChat !== 'function') {
            iconElement.classList.add('displayNone');
        }
    });
}

function addSideBar() {
    if (!draggableTemplate) {
        console.warn(t`Draggable template not found. Side bar will not be added.`);
        return;
    }

    const fragment = /** @type {DocumentFragment} */ (draggableTemplate.content.cloneNode(true));
    const draggable = fragment.querySelector('.draggable');
    const closeButton = fragment.querySelector('.dragClose');

    if (!draggable || !closeButton) {
        console.warn(t`Failed to find draggable or close button. Side bar will not be added.`);
        return;
    }

    draggable.id = 'extensionSideBar';
    closeButton.addEventListener('click', onToggleSidebarClick);

    const scrollContainer = document.createElement('div');
    scrollContainer.id = 'extensionSideBarContainer';
    draggable.appendChild(scrollContainer);

    const loaderContainer = document.createElement('div');
    loaderContainer.id = 'extensionSideBarLoader';
    draggable.appendChild(loaderContainer);

    const loaderIcon = document.createElement('i');
    loaderIcon.className = 'fa-2x fa-solid fa-gear fa-spin';
    loaderContainer.appendChild(loaderIcon);

    movingDivs.appendChild(draggable);
}

function addConnectionProfiles() {
    connectionProfiles.id = 'extensionConnectionProfiles';
    connectionProfilesStatus.id = 'extensionConnectionProfilesStatus';
    connectionProfilesSelect.id = 'extensionConnectionProfilesSelect';
    connectionProfilesSelect.title = t`Switch connection profile`;

    const connectionProfilesServerIcon = document.createElement('i');
    connectionProfilesServerIcon.id = 'extensionConnectionProfilesIcon';
    connectionProfilesServerIcon.className = 'fa-fw fa-solid fa-network-wired';

    connectionProfiles.append(connectionProfilesServerIcon, connectionProfilesSelect, connectionProfilesStatus, connectionProfilesIcon);
    sheld.insertBefore(connectionProfiles, chat);

    apiBlock.querySelectorAll('select').forEach(select => {
        select.addEventListener('input', () => updateStatusDebounced());
    });
}

function bindConnectionProfilesSelect() {
    waitUntilCondition(() => document.getElementById('connection_profiles') !== null).then(() => {
        const connectionProfilesMainSelect = /** @type {HTMLSelectElement} */ (document.getElementById('connection_profiles'));
        if (!connectionProfilesMainSelect) {
            return;
        }
        connectionProfilesSelect.addEventListener('change', async () => {
            connectionProfilesMainSelect.value = connectionProfilesSelect.value;
            connectionProfilesMainSelect.dispatchEvent(new Event('change'));
        });
        connectionProfilesMainSelect.addEventListener('change', async () => {
            connectionProfilesSelect.value = connectionProfilesMainSelect.value;
        });
        const observer = new MutationObserver(() => {
            connectionProfilesSelect.innerHTML = connectionProfilesMainSelect.innerHTML;
            connectionProfilesSelect.value = connectionProfilesMainSelect.value;
        });
        observer.observe(connectionProfilesMainSelect, { childList: true });
    });
}

async function onToggleSidebarClick() {
    const sidebar = document.getElementById('extensionSideBar');
    const toggle = document.getElementById('extensionTopBarToggleSidebar');

    if (!sidebar || !toggle) {
        console.warn(t`Sidebar or toggle button not found`);
        return;
    }

    toggle.classList.toggle('active');
    const alreadyVisible = sidebar.classList.contains('visible');

    const keyframes = [
        { opacity: alreadyVisible ? 1 : 0 },
        { opacity: alreadyVisible ? 0 : 1 },
    ];
    const options = {
        duration: animation_duration,
        easing: animation_easing,
    };

    const animation = sidebar.animate(keyframes, options);

    if (alreadyVisible) {
        await animation.finished;
        sidebar.classList.toggle('visible');
        await populateSideBar();
    } else {
        sidebar.classList.toggle('visible');
        await populateSideBar();
        await animation.finished;
    }

    savePanelsState();
}

async function populateSideBar() {
    const sidebar = document.getElementById('extensionSideBar');
    const loader = document.getElementById('extensionSideBarLoader');
    const container = document.getElementById('extensionSideBarContainer');

    if (!loader || !container || !sidebar) {
        return;
    }

    if (!sidebar.classList.contains('visible')) {
        container.innerHTML = '';
        return;
    }

    loader.classList.add('displayNone');
    const processId = uuidv4();
    const scrollTop = container.scrollTop;
    const prettify = x => {
        x.last_mes = timestampToMoment(x.last_mes);
        x.file_name = String(x.file_name).replace('.jsonl', '');
        return x;
    };
    container.dataset.processId = processId;
    const chatId = getCurrentChatId();
    const chats = (await getChatFiles()).map(prettify).sort((a, b) => sortMoments(a.last_mes, b.last_mes));

    if (container.dataset.processId !== processId) {
        console.log(t`Aborting populateSideBar due to process id mismatch`);
        return;
    }

    container.innerHTML = '';

    for (const chat of chats) {
        const sideBarItem = document.createElement('div');
        sideBarItem.classList.add('sideBarItem');

        sideBarItem.addEventListener('click', async () => {
            if (chat.file_name === chatId || sideBarItem.classList.contains('selected')) {
                return;
            }

            container.childNodes.forEach(x => x instanceof HTMLElement && x.classList.remove('selected'));
            sideBarItem.classList.add('selected');
            await openChatById(chat.file_name);
        });

        const isSelected = chat.file_name === chatId;
        sideBarItem.classList.toggle('selected', isSelected);

        const chatName = document.createElement('div');
        chatName.classList.add('chatName');
        chatName.textContent = chat.file_name;
        chatName.title = chat.file_name;

        const chatDate = document.createElement('small');
        chatDate.classList.add('chatDate');
        chatDate.textContent = chat.last_mes.format('l');
        chatDate.title = chat.last_mes.format('LL LT');

        const chatNameContainer = document.createElement('div');
        chatNameContainer.classList.add('chatNameContainer');
        chatNameContainer.append(chatName, chatDate);

        const chatMessage = document.createElement('div');
        chatMessage.classList.add('chatMessage');
        chatMessage.textContent = chat.mes;
        chatMessage.title = chat.mes;

        const chatStats = document.createElement('div');
        chatStats.classList.add('chatStats');

        const counterBlock = document.createElement('div');
        counterBlock.classList.add('counterBlock');

        const counterIcon = document.createElement('i');
        counterIcon.classList.add('fa-solid', 'fa-comment', 'fa-xs');

        const counterText = document.createElement('small');
        counterText.textContent = chat.chat_items;

        counterBlock.append(counterIcon, counterText);

        const fileSizeText = document.createElement('small');
        fileSizeText.classList.add('fileSize');
        fileSizeText.textContent = chat.file_size;

        chatStats.append(counterBlock, fileSizeText);

        const chatMessageContainer = document.createElement('div');
        chatMessageContainer.classList.add('chatMessageContainer');
        chatMessageContainer.append(chatMessage, chatStats);

        sideBarItem.append(chatNameContainer, chatMessageContainer);
        container.appendChild(sideBarItem);
    }

    container.scrollTop = scrollTop;

    /** @type {HTMLElement} */
    const selectedElement = container.querySelector('.selected');
    const isSelectedElementVisible = selectedElement && selectedElement.offsetTop >= container.scrollTop && selectedElement.offsetTop <= container.scrollTop + container.clientHeight;
    if (!isSelectedElementVisible) {
        container.scrollTop = selectedElement.offsetTop - container.clientHeight / 2;
    }

    loader.classList.add('displayNone');
}

async function openChatById(chatId) {
    const context = SillyTavern.getContext();

    if (!chatId) {
        return;
    }

    if (typeof openGroupChat === 'function' && context.groupId) {
        await openGroupChat(context.groupId, chatId);
        return;
    }

    if (typeof openCharacterChat === 'function' && context.characterId !== undefined) {
        await openCharacterChat(chatId);
        return;
    }
}

async function onChatNameChange() {
    const chatId = chatName.value;
    await openChatById(chatId);
}

async function onToggleConnectionProfilesClick() {
    const button = document.getElementById('extensionTopBarToggleConnectionProfiles');

    if (!button) {
        console.warn('Connection profiles button not found');
        return;
    }

    button.classList.toggle('active');
    connectionProfiles.classList.toggle('visible');
    savePanelsState();
    await onOnlineStatusChange();
}

async function onOnlineStatusChange() {
    if (!connectionProfiles.classList.contains('visible')) {
        return;
    }

    const connectionProfilesMainSelect = /** @type {HTMLSelectElement} */ (document.getElementById('connection_profiles'));
    if (connectionProfilesMainSelect) {
        connectionProfilesSelect.innerHTML = connectionProfilesMainSelect.innerHTML;
        connectionProfilesSelect.value = connectionProfilesMainSelect.value;
    } else {
        connectionProfilesSelect.classList.add('displayNone');
    }

    if (connectionProfilesStatus.nextElementSibling?.classList?.contains('icon-svg')) {
        connectionProfilesStatus.nextElementSibling.remove();
    }

    const { SlashCommandParser, onlineStatus, mainApi } = SillyTavern.getContext();

    if (onlineStatus === 'no_connection') {
        connectionProfilesStatus.classList.add('offline');
        connectionProfilesStatus.textContent = t`No connection...`;

        const nullIcon = new Image();
        nullIcon.classList.add('icon-svg', 'null-icon');
        connectionProfilesStatus.insertAdjacentElement('afterend', nullIcon);
        return;
    }

    async function getCurrentAPI() {
        let currentAPI = mainApi;
        try {
            const commandResult = await SlashCommandParser.commands['api'].callback({ quiet: 'true' }, '');
            if (commandResult) {
                currentAPI = commandResult;
            }
        } catch (error) {
            console.error(t`Failed to get current API`, error);
        }
        const fancyNameOption = apiBlock.querySelector(`select:not(#main_api) option[value="${currentAPI}"]`) ?? apiBlock.querySelector(`select#main_api option[value="${currentAPI}"]`);
        if (fancyNameOption) {
            // Remove text in parentheses or brackets
            return fancyNameOption.textContent.replace(/[[(].*[\])]/, '').trim();
        }
        return currentAPI;
    }

    async function getCurrentModel() {
        let currentModel = onlineStatus;
        try {
            const commandResult = await SlashCommandParser.commands['model'].callback({ quiet: 'true' }, '');
            if (commandResult && typeof commandResult === 'string') {
                currentModel = commandResult;
            }
        } catch (error) {
            console.error(t`Failed to get current model`, error);
        }
        const fancyNameOption = apiBlock.querySelector(`option[value="${currentModel}"]`);
        if (fancyNameOption) {
            return fancyNameOption.textContent.trim();
        }
        return currentModel;
    }

    const [currentAPI, currentModel] = await Promise.all([getCurrentAPI(), getCurrentModel()]);
    await addConnectionProfileIcon();
    connectionProfilesStatus.classList.remove('offline');
    connectionProfilesStatus.textContent = `${currentAPI} – ${currentModel}`;
}

async function addConnectionProfileIcon() {
    return new Promise((resolve) => {
        const modelName = getGeneratingApi();
        const image = new Image();
        image.classList.add('icon-svg');
        image.src = `/img/${modelName}.svg`;

        image.onload = async function () {
            connectionProfilesStatus.insertAdjacentElement('afterend', image);
            await SVGInject(image);
            resolve();
        };

        image.onerror = function () {
            resolve();
        };

        // Prevent infinite waiting
        setTimeout(() => resolve(), 500);
    });
}

function savePanelsState() {
    localStorage.setItem('topBarPanelsState', JSON.stringify({
        sidebarVisible: document.getElementById('extensionSideBar')?.classList.contains('visible'),
        connectionProfilesVisible: document.getElementById('extensionConnectionProfiles')?.classList.contains('visible'),
    }));
}

function restorePanelsState() {
    const state = JSON.parse(localStorage.getItem('topBarPanelsState'));

    if (!state) {
        return;
    }

    if (state.sidebarVisible) {
        document.getElementById('extensionTopBarToggleSidebar')?.click();
    }

    if (state.connectionProfilesVisible) {
        document.getElementById('extensionTopBarToggleConnectionProfiles')?.click();
    }
}

// Init extension on load
(async function () {
    addJQueryHighlight();
    patchSheldIfNeeded();
    addTopBar();
    addIcons();
    addSideBar();
    addConnectionProfiles();
    setChatName(getCurrentChatId());
    chatName.addEventListener('change', onChatNameChange);
    const setChatNameDebounced = debounce(() => setChatName(getCurrentChatId()), debounce_timeout.short);
    for (const eventName of [event_types.CHAT_CHANGED, event_types.CHAT_DELETED, event_types.GROUP_CHAT_DELETED]) {
        eventSource.on(eventName, setChatNameDebounced);
    }
    eventSource.once(event_types.APP_READY, () => {
        bindConnectionProfilesSelect();
        restorePanelsState();
        harborInstallParking();
        harborAnchorViewport();
        harborAdaptLayout();
    });
    eventSource.on(event_types.ONLINE_STATUS_CHANGED, updateStatusDebounced);
})();
