/* Minimal class-host compatibility layer for the locally available React 16.0 runtime.
 * React 18+ uses native hooks automatically. This makes the exact same JSX
 * components render without internet or a package registry in this sandbox.
 */
let hookHost = null;
function dependenciesEqual(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i])); }
function compatState(initial) {
    const host = hookHost, idx = host._hookIdx++;
    if (!host._hooks[idx])
        host._hooks[idx] = { value: typeof initial === 'function' ? initial() : initial };
    const item = host._hooks[idx];
    return [item.value, (next) => { const value = typeof next === 'function' ? next(item.value) : next; if (!Object.is(value, item.value)) {
            item.value = value;
            host.forceUpdate();
        } }];
}
function compatMemo(factory, deps) {
    const host = hookHost, idx = host._hookIdx++;
    let item = host._hooks[idx];
    if (!item || !dependenciesEqual(item.deps, deps)) {
        item = { deps, value: factory() };
        host._hooks[idx] = item;
    }
    return item.value;
}
function compatEffect(effect, deps) {
    const host = hookHost, idx = host._hookIdx++;
    let item = host._hooks[idx];
    if (!item) {
        item = { deps: null, cleanup: null };
        host._hooks[idx] = item;
    }
    if (!dependenciesEqual(item.deps, deps))
        host._effects.push({ idx, effect, deps });
}
function legacyHost(fn) {
    return class HookHost extends React.Component {
        constructor(props) { super(props); this._hooks = []; this._hookIdx = 0; this._effects = []; }
        render() {
            const prev = hookHost;
            hookHost = this;
            this._hookIdx = 0;
            this._effects = [];
            try {
                return fn(this.props);
            }
            finally {
                hookHost = prev;
            }
        }
        componentDidMount() { this._flushEffects(); }
        componentDidUpdate() { this._flushEffects(); }
        componentWillUnmount() { for (const h of this._hooks) {
            if (h && typeof h.cleanup === 'function')
                h.cleanup();
        } }
        _flushEffects() { for (const { idx, effect, deps } of this._effects) {
            const item = this._hooks[idx];
            if (typeof item.cleanup === 'function')
                item.cleanup();
            item.deps = deps;
            item.cleanup = effect() || null;
        } }
    };
}
const useState = React.useState || compatState;
const useEffect = React.useEffect || compatEffect;
const useMemo = React.useMemo || compatMemo;
const useCallback = React.useCallback || ((f, deps) => compatMemo(() => f, deps));
const withHooks = React.useState ? (f => f) : legacyHost;
/* TrustLab · An offline-buildable React application.
 * React 18 UMD is shipped locally; this JSX compiles to React.createElement.
 * No CDN or JavaScript package registry is needed for the MVP.
 */
const h = React.createElement;
function newRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const n = Math.floor(Math.random() * 16);
        return (c === 'x' ? n : (n & 3 | 8)).toString(16);
    });
}
const API = {
    async request(url, init = {}) {
        const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
        let data;
        try {
            data = await response.json();
        }
        catch {
            data = {};
        }
        if (!response.ok)
            throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`);
        return data;
    },
    start: (params) => API.request('/api/game/start', { method: 'POST', body: JSON.stringify(params) }),
    session: (id) => API.request(`/api/game/${encodeURIComponent(id)}`),
    move: (id, move, request_id) => API.request(`/api/game/${encodeURIComponent(id)}/round`, { method: 'POST', body: JSON.stringify({ move, request_id }) }),
    results: (id) => API.request(`/api/game/${encodeURIComponent(id)}/results`),
    research: () => API.request('/api/research/summary'),
    health: () => API.request('/api/health'),
};
const NAMES = { C: 'Cooperate', D: 'Defect' };
const TREAT = { fix: 'Fixed partner', rand: 'Changing partners' };
const MODE = { challenge: 'Challenge', research: 'Research' };
const strategies = ['Forgiving Cooperator', 'Reciprocator', 'Erratic', 'Defector'];
function Arrow({ diagonal = false }) { return React.createElement("span", { "aria-hidden": "true", className: "arrow-glyph" }, diagonal ? '↗' : '→'); }
function Logo({ onClick }) { return React.createElement("button", { className: "logo", onClick: onClick, "aria-label": "TrustLab home" },
    React.createElement("span", { className: "logo-mark", "aria-hidden": "true" },
        React.createElement("span", null),
        React.createElement("span", null),
        React.createElement("span", null),
        React.createElement("span", null)),
    React.createElement("span", null,
        "TRUST",
        React.createElement("span", { className: "logo-light" }, "LAB")),
    React.createElement("span", { className: "logo-sub" }, "THE HUMAN EXPERIMENT")); }
function useRoute() {
    const [pathname, setPath] = useState(window.location.pathname === 'blank' ? '/' : window.location.pathname);
    useEffect(() => { const f = () => setPath(window.location.pathname); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
    const go = useCallback(path => { window.history.pushState({}, '', path); setPath(path); window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
    return [pathname, go];
}
function Shell({ children, route, go, apiStatus }) {
    return React.createElement("div", { className: "app-shell" },
        React.createElement("header", { className: "masthead wrap" },
            React.createElement(Logo, { onClick: () => go('/') }),
            React.createElement("nav", { "aria-label": "Main navigation" },
                React.createElement("button", { className: route === '/' ? 'nav-active' : '', onClick: () => go('/') }, "THE EXPERIENCE"),
                React.createElement("button", { className: route.startsWith('/lab') ? 'nav-active' : '', onClick: () => go('/lab') }, "RESEARCH LAB")),
            React.createElement("button", { className: "header-cta", onClick: () => go('/multiplayer') },
                "FIND A PLAYER ",
                React.createElement(Arrow, null))),
        React.createElement("div", { className: "top-line" }),
        React.createElement("main", { id: "main-content" }, children),
        React.createElement("footer", { className: "footer" },
            React.createElement("div", { className: "wrap footer-top" },
                React.createElement("div", null,
                    React.createElement("span", { className: "eyebrow" }, "TRUSTLAB / A BEHAVIORAL AI EXPERIMENT"),
                    React.createElement("h2", null,
                        "Every choice leaves",
                        React.createElement("br", null),
                        "a pattern.")),
                React.createElement("div", { className: "footer-links" },
                    React.createElement("button", { onClick: () => go('/multiplayer') },
                        "Play a human opponent ",
                        React.createElement(Arrow, { diagonal: true })),
                    React.createElement("button", { onClick: () => go('/lab') },
                        "Explore the research ",
                        React.createElement(Arrow, { diagonal: true })),
                    React.createElement("a", { href: "https://doi.org/10.5061/dryad.37pvmcvmk", target: "_blank", rel: "noreferrer" },
                        "Original dataset ",
                        React.createElement(Arrow, { diagonal: true })))),
            React.createElement("div", { className: "wrap footer-bottom" },
                React.createElement("span", null, "TRUSTLAB \u00A9 2026 \u00B7 AN EDUCATIONAL MACHINE LEARNING EXPERIENCE"),
                React.createElement("span", { className: "footer-status" },
                    React.createElement("i", { className: apiStatus === 'online' ? 'status-dot' : 'status-dot offline' }),
                    apiStatus === 'online' ? 'MODELS ONLINE' : apiStatus === 'offline' ? 'API UNAVAILABLE' : 'CHECKING SYSTEM'))));
}
function Network({ compact = false }) {
    const coords = [[118, 80], [255, 56], [384, 117], [480, 67], [533, 202], [447, 270], [310, 220], [215, 302], [101, 256], [68, 405], [204, 444], [349, 403], [489, 443], [550, 345], [345, 315], [270, 132], [153, 174]];
    const edges = [[0, 1], [0, 16], [0, 8], [1, 15], [1, 2], [2, 3], [2, 6], [2, 4], [3, 4], [4, 5], [4, 13], [5, 6], [5, 14], [5, 13], [6, 7], [6, 15], [6, 14], [7, 8], [7, 10], [7, 14], [8, 9], [8, 16], [9, 10], [10, 11], [11, 12], [11, 14], [12, 13], [13, 14], [15, 16]];
    return React.createElement("div", { className: `network ${compact ? 'network-compact' : ''}`, "aria-hidden": "true" },
        React.createElement("div", { className: "network-glow" }),
        React.createElement("svg", { viewBox: "0 0 610 520", preserveAspectRatio: "xMidYMid meet" },
            React.createElement("g", { className: "network-orbit" },
                React.createElement("circle", { cx: "307", cy: "247", r: "173", className: "network-guide" }),
                React.createElement("circle", { cx: "307", cy: "247", r: "120", className: "network-guide network-dashed" }),
                React.createElement("ellipse", { cx: "307", cy: "247", rx: "250", ry: "84", className: "network-guide tilted", transform: "rotate(-32 307 247)" })),
            React.createElement("g", null, edges.map(([a, b], i) => React.createElement("line", { key: i, x1: coords[a][0], y1: coords[a][1], x2: coords[b][0], y2: coords[b][1], className: 'network-link ' + (i % 4 === 0 ? 'active-link' : '') }))),
            React.createElement("g", null, coords.map(([x, y], i) => React.createElement("g", { key: i },
                React.createElement("circle", { cx: x, cy: y, r: i % 5 === 0 ? 16 : 9, className: 'network-node-halo ' + (i % 3 === 0 ? 'warm' : '') }),
                React.createElement("circle", { cx: x, cy: y, r: i % 5 === 0 ? 5 : 3, className: 'network-node ' + (i % 3 === 0 ? 'warm' : '') })))),
            React.createElement("g", null,
                React.createElement("circle", { cx: "307", cy: "247", r: "61", className: "network-core-outer" }),
                React.createElement("circle", { cx: "307", cy: "247", r: "42", className: "network-core-inner" }),
                React.createElement("path", { d: "M279 242 L297 260 L336 221", fill: "none", stroke: "#d4e1d8", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }),
                React.createElement("text", { x: "307", y: "293", textAnchor: "middle", className: "network-signal" }, "DECISION ENGINE")),
            React.createElement("text", { x: "19", y: "61", className: "network-coordinate" }, "NODE 01 / HUMAN INPUT"),
            React.createElement("text", { x: "382", y: "501", className: "network-coordinate" }, "OBSERVATION / 100 ROUNDS")),
        React.createElement("div", { className: "orb-tag orb-tag-a" },
            React.createElement("span", { className: "pulse-dot" }),
            " PATTERN RECOGNITION"),
        React.createElement("div", { className: "orb-tag orb-tag-b" }, "AI / HUMAN BEHAVIOR"));
}
// The Last Grid is a fictional framing of the existing Prisoner's Dilemma.
// No additional game state, payoffs, observations, opponent logic or ML features.
function gridOutcome(player, opponent) {
    if (player === 'C' && opponent === 'C')
        return { title: 'THE GRID STABILIZES.', copy: 'Both districts contributed to the shared grid. Cooperation brought benefits to both sides.', state: 'SHARED POWER / MUTUAL COOPERATION' };
    if (player === 'D' && opponent === 'D')
        return { title: 'THE GRID STRUGGLES.', copy: 'Both districts diverted power to protect themselves. Neither gained much.', state: 'MINIMAL RETURNS / MUTUAL DEFECTION' };
    if (player === 'C')
        return { title: 'TRUST WAS EXPLOITED.', copy: 'Your district contributed, but the other diverted the benefit toward itself.', state: 'YOUR DISTRICT CONTRIBUTED' };
    return { title: 'YOUR DISTRICT GAINS.', copy: 'The other district contributed while yours diverted power for its own advantage.', state: 'YOUR DISTRICT DIVERTED POWER' };
}
function GridSkyline() {
    return React.createElement("div", { className: "grid-visual", "aria-hidden": "true" },
        React.createElement("div", { className: "grid-visual-haze" }),
        React.createElement("svg", { viewBox: "0 0 900 400", preserveAspectRatio: "xMidYMax slice", role: "presentation" },
            React.createElement("defs", null,
                React.createElement("linearGradient", { id: "gridCity", x1: "0", x2: "0", y1: "0", y2: "1" },
                    React.createElement("stop", { stopColor: "#203949" }),
                    React.createElement("stop", { offset: "1", stopColor: "#0a111a" })),
                React.createElement("linearGradient", { id: "powerLine", x1: "0", x2: "1" },
                    React.createElement("stop", { stopColor: "#58a68e", stopOpacity: ".08" }),
                    React.createElement("stop", { offset: ".48", stopColor: "#98d8b8" }),
                    React.createElement("stop", { offset: "1", stopColor: "#dc9975", stopOpacity: ".08" }))),
            React.createElement("g", { fill: "url(#gridCity)" },
                React.createElement("path", { d: "M0 360V238h49v-78h53v36h57V94h79v109h42v-53h63v83h57V123h61v68h50V65h68v160h50v-42h62v-69h70v112h64v-43h66v97h74v80z" }),
                React.createElement("path", { d: "M0 398v-44h900v44z", fill: "#071017" })),
            React.createElement("g", { stroke: "#67b79f", strokeOpacity: ".26", strokeWidth: "2", fill: "none" },
                React.createElement("path", { d: "M0 335H900" }),
                React.createElement("path", { d: "M75 335v-72m86 72V221m116 114v-61m96 61v-43m112 43v-92m90 92V183m121 152v-76m98 76v-41" })),
            React.createElement("g", { fill: "#a8d1c1", opacity: ".45" }, Array.from({ length: 45 }, (_, i) => { const x = 23 + (i % 15) * 59, y = 165 + Math.floor(i / 15) * 48; return React.createElement("rect", { key: i, x: x, y: y, width: "4", height: "8", rx: "1" }); })),
            React.createElement("path", { d: "M35 336 C175 272 290 298 445 335 S720 404 865 331", stroke: "url(#powerLine)", strokeWidth: "4", fill: "none", strokeLinecap: "round" }),
            React.createElement("circle", { cx: "444", cy: "334", r: "13", fill: "#9bd7b5", fillOpacity: ".2" }),
            React.createElement("circle", { cx: "444", cy: "334", r: "4", fill: "#a7e6c8" }),
            React.createElement("g", { fontFamily: "monospace", fontSize: "12", letterSpacing: "3", fill: "#b1d9c9" },
                React.createElement("text", { x: "86", y: "120" }, "DISTRICT 01"),
                React.createElement("text", { x: "635", y: "120" }, "DISTRICT 02"))),
        React.createElement("span", { className: "grid-visual-signal" },
            React.createElement("i", { className: "pulse-dot" }),
            " LAST ACTIVE POWER NETWORK"));
}
function LastGridBriefing() {
    return React.createElement("div", { className: "lastgrid-briefing", "aria-label": "The Last Grid story briefing" },
        React.createElement("div", { className: "grid-briefing-copy" },
            React.createElement(Eyebrow, null, "MISSION BRIEFING / FICTIONAL SCENARIO"),
            React.createElement("h2", null,
                "THE CITY HAS",
                React.createElement("br", null),
                React.createElement("em", null, "GONE DARK.")),
            React.createElement("p", { className: "grid-lead" }, "Only one power grid remains operational, connecting two isolated districts."),
            React.createElement("p", null, "You control one district. Somewhere across the city, another real person has been assigned the same responsibility. You have never met. You cannot communicate. And neither of you knows what the other will decide."),
            React.createElement("div", { className: "grid-directives" },
                React.createElement("div", null,
                    React.createElement("span", { className: "grid-directive-icon grid-share-icon" }, "\u2197"),
                    React.createElement("div", null,
                        React.createElement("strong", null, "COOPERATE / SHARE POWER"),
                        React.createElement("p", null, "Contribute to the shared grid. If you both cooperate, both districts benefit."))),
                React.createElement("div", null,
                    React.createElement("span", { className: "grid-directive-icon grid-divert-icon" }, "\u2198"),
                    React.createElement("div", null,
                        React.createElement("strong", null, "DEFECT / DIVERT POWER"),
                        React.createElement("p", null, "Prioritize your own district. If the other contributes, you gain more at their expense.")))),
            React.createElement("p", { className: "grid-question" }, "Will you build trust? Retaliate after betrayal? Forgive? Or prioritize yourself every time?"),
            React.createElement("div", { className: "grid-observer" },
                React.createElement("span", { className: "grid-observer-icon" }, "\u25CE"),
                React.createElement("p", null,
                    React.createElement("strong", null, "THE OBSERVER"),
                    React.createElement("br", null),
                    "An AI will analyze your decisions, predict your next move, and identify behavioral patterns. Your opponent is human; the AI is not making their choices.")),
            React.createElement("button", { type: "button", className: "btn btn-primary", onClick: () => document.getElementById('mission-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
                "ACCEPT YOUR MISSION ",
                React.createElement(Arrow, { diagonal: true }))),
        React.createElement(GridSkyline, null));
}
function Payoff({ small = false }) { return React.createElement("div", { className: 'payoff-matrix ' + (small ? 'compact' : '') },
    React.createElement("div", { className: "payoff-title" },
        React.createElement("span", null, "YOU \u2193 / OPPONENT \u2192"),
        React.createElement("span", null, "COOPERATE"),
        React.createElement("span", null, "DEFECT")),
    React.createElement("div", { className: "payoff-row" },
        React.createElement("strong", null, "COOPERATE"),
        React.createElement("div", null,
            React.createElement("b", null, "3 / 3"),
            React.createElement("small", null, "MUTUAL TRUST")),
        React.createElement("div", null,
            React.createElement("b", null, "0 / 4"),
            React.createElement("small", null, "BETRAYED"))),
    React.createElement("div", { className: "payoff-row" },
        React.createElement("strong", null, "DEFECT"),
        React.createElement("div", null,
            React.createElement("b", null, "4 / 0"),
            React.createElement("small", null, "YOU GAIN")),
        React.createElement("div", null,
            React.createElement("b", null, "1 / 1"),
            React.createElement("small", null, "MUTUAL DEFECT"))),
    React.createElement("p", null,
        "Numbers show ",
        React.createElement("b", null, "your points / opponent's points"),
        ".")); }
function Eyebrow({ children }) { return React.createElement("span", { className: "eyebrow" },
    React.createElement("span", { className: "eyebrow-line" }),
    children); }
function Home({ go }) {
    return React.createElement("div", { className: "page-sections" },
        React.createElement("section", { className: "hero wrap" },
            React.createElement("div", { className: "hero-left" },
                React.createElement(Eyebrow, null, "TRUSTLAB / THE LAST GRID"),
                React.createElement("h1", null,
                    "TRUST IS",
                    React.createElement("br", null),
                    "NEVER ",
                    React.createElement("em", null, "JUST"),
                    React.createElement("br", null),
                    "A CHOICE",
                    React.createElement("span", { className: "period" }, ".")),
                React.createElement("p", null, "The city has gone dark. Two districts must share the last power grid. One stranger decides with you\u2014and an AI studies every move."),
                React.createElement("div", { className: "hero-actions" },
                    React.createElement("button", { className: "btn btn-primary", onClick: () => go('/multiplayer') },
                        "PLAY A REAL PERSON ",
                        React.createElement(Arrow, { diagonal: true })),
                    React.createElement("button", { className: "btn btn-link", onClick: () => go('/setup') },
                        "SOLO EXPERIMENT ",
                        React.createElement(Arrow, null))),
                React.createElement("div", { className: "hero-lower" },
                    React.createElement("span", null,
                        React.createElement("span", { className: "pulse-dot" }),
                        " AN INTERACTIVE AI EXPERIENCE"),
                    React.createElement("span", null, "SCROLL TO EXPLORE \u2193"))),
            React.createElement("div", { className: "hero-right" },
                React.createElement(Network, null),
                React.createElement("div", { className: "hero-index" },
                    React.createElement("span", null, "FIG. 01"),
                    " CONNECTED DECISIONS / ADAPTIVE PATTERNS"))),
        React.createElement("section", { className: "stats-band" },
            React.createElement("div", { className: "wrap stat-row" },
                React.createElement("div", null,
                    React.createElement("strong", null,
                        "188",
                        React.createElement("span", null, "+")),
                    React.createElement("span", null, "REAL RESEARCH PARTICIPANTS")),
                React.createElement("div", null,
                    React.createElement("strong", null, "18,800"),
                    React.createElement("span", null, "DOCUMENTED DECISIONS")),
                React.createElement("div", null,
                    React.createElement("strong", null, "04"),
                    React.createElement("span", null, "DISCOVERED BEHAVIORAL GROUPS")),
                React.createElement("div", null,
                    React.createElement("strong", null, "02"),
                    React.createElement("span", null, "COMPLEMENTARY ML MODELS")))),
        React.createElement("section", { className: "chapter wrap" },
            React.createElement("div", { className: "chapter-side" },
                React.createElement(Eyebrow, null, "01 / THE DILEMMA"),
                React.createElement("div", { className: "side-rule" }),
                React.createElement("span", null,
                    "NO PERFECT CHOICE.",
                    React.createElement("br", null),
                    "ONLY CONSEQUENCES.")),
            React.createElement("div", { className: "chapter-main" },
                React.createElement("h2", null,
                    "THE PERSON ACROSS",
                    React.createElement("br", null),
                    "FROM YOU CAN ",
                    React.createElement("em", null, "CHANGE"),
                    React.createElement("br", null),
                    "EVERYTHING."),
                React.createElement("p", null, "In the Prisoner's Dilemma, cooperating can build value for both players. Defecting can win you more\u2014if the other person trusts you. What happens when you must decide again, and again?"),
                React.createElement(Payoff, null),
                React.createElement("button", { className: "text-action", onClick: () => go('/setup') },
                    "TRY THE DILEMMA ",
                    React.createElement(Arrow, { diagonal: true })))),
        React.createElement("section", { className: "duality" },
            React.createElement("div", { className: "wrap" },
                React.createElement(Eyebrow, null, "02 / TWO INTELLIGENCES"),
                React.createElement("h2", null,
                    "ONE GAME.",
                    React.createElement("br", null),
                    React.createElement("em", null, "TWO WAYS TO UNDERSTAND YOU.")),
                React.createElement("div", { className: "duality-grid" },
                    React.createElement("article", { className: "duality-card" },
                        React.createElement("div", { className: "duality-card-top" },
                            React.createElement("span", null, "01 / SUPERVISED LEARNING"),
                            React.createElement("span", { className: "outline-circle" }, "\u2197")),
                        React.createElement("div", { className: "symbol" }, "01"),
                        React.createElement("h3", null,
                            "WHAT WILL YOU",
                            React.createElement("br", null),
                            "DO ",
                            React.createElement("em", null, "NEXT?")),
                        React.createElement("p", null, "Logistic Regression reads your previous decisions and predicts whether you will cooperate or defect before you choose."),
                        React.createElement("div", { className: "card-bottom" },
                            React.createElement("span", null, "MODEL"),
                            React.createElement("strong", null, "LOGISTIC REGRESSION"))),
                    React.createElement("article", { className: "duality-card green-card" },
                        React.createElement("div", { className: "duality-card-top" },
                            React.createElement("span", null, "02 / UNSUPERVISED LEARNING"),
                            React.createElement("span", { className: "outline-circle" }, "\u2733")),
                        React.createElement("div", { className: "symbol" }, "04"),
                        React.createElement("h3", null,
                            "WHO DO YOU",
                            React.createElement("br", null),
                            "PLAY ",
                            React.createElement("em", null, "LIKE?")),
                        React.createElement("p", null, "K-Means discovers behavioral similarities and reveals the closest observed strategy profile from actual research data."),
                        React.createElement("div", { className: "card-bottom" },
                            React.createElement("span", null, "MODEL"),
                            React.createElement("strong", null, "K-MEANS CLUSTERING")))))),
        React.createElement("section", { className: "invitation wrap" },
            React.createElement("div", { className: "invitation-content" },
                React.createElement(Eyebrow, null, "03 / THE LAST GRID"),
                React.createElement("h2", null,
                    "TWO DISTRICTS.",
                    React.createElement("br", null),
                    "ONE ",
                    React.createElement("em", null, "POWER GRID.")),
                React.createElement("p", null, "Become a district controller. Play 12 or 25 energy-distribution cycles with a randomly matched human. Share power, or divert it for yourself\u2014the AI observes every decision."),
                React.createElement("button", { className: "btn btn-primary", onClick: () => go('/multiplayer') },
                    "FIND A HUMAN OPPONENT ",
                    React.createElement(Arrow, { diagonal: true }))),
            React.createElement("div", { className: "invitation-visual" },
                React.createElement("span", null, "COOPERATE"),
                React.createElement("div", { className: "choice-divider" }),
                React.createElement("span", null, "DEFECT"),
                React.createElement("div", { className: "choice-noise" }, "C D C C D D C D C C D C"))));
}
function OptionCard({ selected, onClick, icon, kicker, title, description, small = false }) { return React.createElement("button", { type: "button", className: 'option-card ' + (selected ? 'selected ' : '') + (small ? 'option-small' : ''), onClick: onClick, "aria-pressed": selected },
    React.createElement("span", { className: "option-head" },
        React.createElement("span", { className: "option-icon" }, icon),
        React.createElement("span", { className: "option-indicator" }, selected ? '✓' : '+')),
    React.createElement("span", { className: "option-kicker" }, kicker),
    React.createElement("strong", null, title),
    React.createElement("span", { className: "option-copy" }, description)); }
function SetupFn({ go, apiStatus }) {
    const [treatment, setTreatment] = useState('fix');
    const [rounds, setRounds] = useState(12);
    const [feedback, setFeedback] = useState('challenge');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const begin = async () => { setBusy(true); setError(''); try {
        const s = await API.start({ treatment, rounds, feedback });
        go('/arena/' + s.id);
    }
    catch (e) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } };
    return React.createElement("section", { className: "inner-page wrap setup-page" },
        React.createElement("div", { className: "page-intro" },
            React.createElement(Eyebrow, null, "EXPERIMENT CONFIGURATION / 02"),
            React.createElement("h1", null,
                "DESIGN YOUR",
                React.createElement("br", null),
                React.createElement("em", null, "DILEMMA.")),
            React.createElement("p", null, "Choose the conditions. Every decision will be yours. The other side is simulated, but the AI predictions are real.")),
        React.createElement("div", { className: "setup-layout" },
            React.createElement("div", { className: "setup-form" },
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "01"),
                        React.createElement("h2", null, "WHO ARE YOU PLAYING?")),
                    React.createElement("div", { className: "options-two" },
                        React.createElement(OptionCard, { selected: treatment === 'fix', onClick: () => setTreatment('fix'), icon: "\u25CE", kicker: "CONDITION A", title: "Fixed partner", description: "Face the same simulated behavioral policy every round. Can trust survive repeated encounters?" }),
                        React.createElement(OptionCard, { selected: treatment === 'rand', onClick: () => setTreatment('rand'), icon: "\u2318", kicker: "CONDITION B", title: "Changing partners", description: "An independently sampled simulated opponent policy each round. You cannot build a lasting relationship." }))),
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "02"),
                        React.createElement("h2", null, "HOW FAR WILL YOU GO?")),
                    React.createElement("div", { className: "options-two" },
                        React.createElement(OptionCard, { small: true, selected: rounds === 12, onClick: () => setRounds(12), icon: "12", kicker: "QUICK EXPERIMENT", title: "12 rounds", description: "A fast experience with a preliminary behavioral reveal." }),
                        React.createElement(OptionCard, { small: true, selected: rounds === 25, onClick: () => setRounds(25), icon: "25", kicker: "DEEP EXPERIMENT", title: "25 rounds", description: "More interactions. Still an exploratory short-history profile." }))),
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "03"),
                        React.createElement("h2", null, "WHEN SHOULD WE REVEAL THE AI?")),
                    React.createElement("div", { className: "options-two" },
                        React.createElement(OptionCard, { small: true, selected: feedback === 'challenge', onClick: () => setFeedback('challenge'), icon: "\u2197", kicker: "LIVE REVEALS", title: "Challenge mode", description: "See the AI's sealed prediction after every committed move." }),
                        React.createElement(OptionCard, { small: true, selected: feedback === 'research', onClick: () => setFeedback('research'), icon: "\u2301", kicker: "BLIND EXPERIMENT", title: "Research mode", description: "Keep predictions hidden until your final report." }))),
                error && React.createElement("div", { role: "alert", className: "error-notice" }, error),
                React.createElement("button", { className: "btn btn-primary btn-wide", disabled: busy || apiStatus === 'offline', onClick: begin },
                    busy ? 'CREATING SESSION…' : 'START THE EXPERIMENT',
                    " ",
                    React.createElement(Arrow, { diagonal: true })),
                React.createElement("p", { className: "disclaimer" }, "Anonymous session \u00B7 No account \u00B7 No personal information collected \u00B7 Session expires after 4 hours")),
            React.createElement("aside", { className: "setup-aside" },
                React.createElement("div", { className: "sticky-side" },
                    React.createElement("span", { className: "eyebrow" }, "RULES OF ENGAGEMENT"),
                    React.createElement("h3", null,
                        "TWO CHOICES.",
                        React.createElement("br", null),
                        "FOUR OUTCOMES."),
                    React.createElement("p", null, "You and your opponent make a decision independently. Neither player sees the other side's current choice before committing."),
                    React.createElement(Payoff, { small: true }),
                    React.createElement("div", { className: "side-note" },
                        React.createElement("span", null, "IMPORTANT"),
                        React.createElement("p", null, "Your short-session strategy profile is exploratory, not a personality diagnosis or a validated psychological test."))))));
}
function Loading({ message = 'LOADING EXPERIMENT' }) { return React.createElement("div", { className: "loading-screen" },
    React.createElement("div", { className: "spinner-orbit" }),
    React.createElement("span", { className: "eyebrow" }, message)); }
function MoveButton({ type, onClick, disabled }) { return React.createElement("button", { disabled: disabled, onClick: () => onClick(type), className: 'move-button ' + (type === 'C' ? 'cooperate' : 'defect') },
    React.createElement("span", { className: "move-button-symbol" }, type === 'C' ? '↗' : '↘'),
    React.createElement("span", null,
        React.createElement("small", null, "CHOOSE TO"),
        React.createElement("strong", null, type === 'C' ? 'COOPERATE' : 'DEFECT')),
    React.createElement("span", { className: "move-go" }, "\u2192")); }
function ArenaFn({ id, go }) {
    const [session, setSession] = useState(null);
    const [reveal, setReveal] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { let mounted = true; API.session(id).then(v => { if (mounted)
        setSession(v); }).catch(e => { if (mounted)
        setError(e.message); }); return () => { mounted = false; }; }, [id]);
    const pick = async (move) => { if (!session || busy || reveal)
        return; setBusy(true); setError(''); try {
        const rid = newRequestId();
        const r = await API.move(id, move, rid);
        setSession(r.session);
        setReveal(r.round_result);
    }
    catch (e) {
        setError(e.message);
    }
    finally {
        setBusy(false);
    } };
    if (error && !session)
        return React.createElement("div", { className: "inner-page wrap error-page" },
            React.createElement(Eyebrow, null, "SESSION UNAVAILABLE"),
            React.createElement("h1", null,
                "WE LOST THE",
                React.createElement("br", null),
                React.createElement("em", null, "CONNECTION.")),
            React.createElement("p", null, error),
            React.createElement("button", { className: "btn btn-primary", onClick: () => go('/setup') },
                "START AGAIN ",
                React.createElement(Arrow, null)));
    if (!session)
        return React.createElement(Loading, { message: "RESTORING YOUR SESSION" });
    return React.createElement("section", { className: "arena-page wrap" },
        React.createElement("div", { className: "arena-top" },
            React.createElement("div", null,
                React.createElement(Eyebrow, null, "TRUST ARENA / LIVE SIMULATION"),
                React.createElement("h1", null,
                    "THE NEXT ",
                    React.createElement("em", null, "MOVE"),
                    " IS YOURS.")),
            React.createElement("div", { className: "round-badge" },
                "ROUND ",
                React.createElement("strong", null,
                    Math.min(session.round, session.rounds_limit).toString().padStart(2, '0'),
                    " ",
                    React.createElement("span", null,
                        "/ ",
                        session.rounds_limit)))),
        React.createElement("div", { className: "progress-track" },
            React.createElement("div", { style: { width: `${session.completed / session.rounds_limit * 100}%` } })),
        React.createElement("div", { className: "arena-meta" },
            React.createElement("span", null,
                TREAT[session.treatment].toUpperCase(),
                " / SIMULATED OPPONENT"),
            React.createElement("span", null, session.feedback === 'research' ? 'RESEARCH MODE · PREDICTIONS SEALED' : 'CHALLENGE MODE · POST-ROUND REVEALS')),
        React.createElement("div", { className: "arena-board" },
            React.createElement("div", { className: "participant player" },
                React.createElement("span", { className: "participant-label" }, "01 / HUMAN PLAYER"),
                React.createElement("div", { className: "participant-icon" }, "\u25CE"),
                React.createElement("h2", null, "YOU"),
                React.createElement("span", { className: "participant-score" }, session.score_player.toString().padStart(2, '0')),
                React.createElement("small", null, "TOTAL POINTS")),
            React.createElement("div", { className: "arena-center" },
                React.createElement("span", { className: "arena-center-kicker" }, "SIMULTANEOUS DECISION"),
                React.createElement("div", { className: "versus" },
                    React.createElement("span", null, "Y"),
                    React.createElement("b", null, "VS"),
                    React.createElement("span", null, "AI")),
                React.createElement("div", { className: "lock-statement" },
                    React.createElement("span", { className: "mini-lock" }, "\u2301"),
                    " AI PREDICTION & OPPONENT MOVE SEALED"),
                React.createElement("p", null, "Neither side can see the other's current decision.")),
            React.createElement("div", { className: "participant opponent" },
                React.createElement("span", { className: "participant-label" }, "02 / SIMULATED OPPONENT"),
                React.createElement("div", { className: "participant-icon opponent-symbol" }, "\u2733"),
                React.createElement("h2", null, "OPPONENT"),
                React.createElement("span", { className: "participant-score" }, session.score_opponent.toString().padStart(2, '0')),
                React.createElement("small", null, "TOTAL POINTS"))),
        !reveal && !session.finished ? React.createElement("div", { className: "decision-zone" },
            React.createElement("span", { className: "eyebrow" },
                "YOUR DECISION / ",
                String(session.completed + 1).padStart(2, '0')),
            React.createElement("h2", null, "COOPERATE OR DEFECT?"),
            React.createElement("div", { className: "choice-grid" },
                React.createElement(MoveButton, { type: "C", disabled: busy, onClick: pick }),
                React.createElement(MoveButton, { type: "D", disabled: busy, onClick: pick })),
            React.createElement("p", null, "Choose deliberately. The AI has already committed its prediction."),
            busy && React.createElement("span", { className: "submitting", "aria-live": "polite" }, "RESOLVING THE ROUND\u2026")) : null,
        reveal && React.createElement("div", { className: "reveal-panel", "aria-live": "polite" },
            React.createElement("span", { className: "eyebrow" },
                "ROUND ",
                reveal.round,
                " / DECISIONS REVEALED"),
            React.createElement("h2", null, reveal.player_move === reveal.opponent_move ? 'A SHARED DECISION.' : 'TWO DIFFERENT CHOICES.'),
            React.createElement("div", { className: "reveal-cards" },
                React.createElement("div", null,
                    React.createElement("span", null, "YOU CHOSE"),
                    React.createElement("strong", { className: reveal.player_move === 'C' ? 'green' : 'copper' }, NAMES[reveal.player_move]),
                    React.createElement("b", null,
                        "+",
                        reveal.points_player,
                        " POINTS")),
                React.createElement("div", null,
                    React.createElement("span", null, "OPPONENT CHOSE"),
                    React.createElement("strong", { className: reveal.opponent_move === 'C' ? 'green' : 'copper' }, NAMES[reveal.opponent_move]),
                    React.createElement("b", null,
                        "+",
                        reveal.points_opponent,
                        " POINTS"))),
            reveal.prediction ? React.createElement("div", { className: "prediction-reveal" },
                React.createElement("span", null, "SEALED AI PREDICTION"),
                React.createElement("strong", null, NAMES[reveal.prediction.move]),
                React.createElement("span", { className: reveal.prediction_correct ? 'correct' : 'missed' }, reveal.prediction_correct ? '✓ CORRECT' : '× DIFFERENT FROM YOUR CHOICE')) : React.createElement("div", { className: "prediction-reveal" },
                React.createElement("span", null, "AI PREDICTION"),
                React.createElement("strong", null, "SEALED UNTIL YOUR FINAL REPORT")),
            React.createElement("button", { className: "btn btn-primary", onClick: () => { if (session.finished)
                    go('/results/' + id);
                else
                    setReveal(null); } },
                session.finished ? 'UNLOCK YOUR BEHAVIORAL REPORT' : 'CONTINUE TO NEXT ROUND',
                " ",
                React.createElement(Arrow, { diagonal: true }))),
        !reveal && session.finished && React.createElement("div", { className: "reveal-panel" },
            React.createElement("h2", null, "THE EXPERIMENT IS COMPLETE."),
            React.createElement("button", { className: "btn btn-primary", onClick: () => go('/results/' + id) },
                "VIEW YOUR REPORT ",
                React.createElement(Arrow, null))),
        error && React.createElement("div", { role: "alert", className: "error-notice" }, error),
        React.createElement("div", { className: "arena-ledger" },
            React.createElement("div", { className: "ledger-head" },
                React.createElement("span", null, "DECISION HISTORY"),
                React.createElement("span", null,
                    session.completed,
                    " / ",
                    session.rounds_limit,
                    " ROUNDS RECORDED")),
            React.createElement("div", { className: "ledger-dots" }, Array.from({ length: session.rounds_limit }, (_, i) => { const r = session.history[i]; return React.createElement("span", { key: i, title: r ? `Round ${i + 1}: You ${NAMES[r.player_move]}, opponent ${NAMES[r.opponent_move]}` : `Round ${i + 1} not played`, className: 'ledger-dot ' + (r ? (r.player_move === 'C' ? 'ledger-c' : 'ledger-d') : 'ledger-empty') }, r ? (r.player_move === 'C' ? 'C' : 'D') : ''); }))));
}
function Stat({ value, label, sub }) { return React.createElement("div", { className: "report-stat" },
    React.createElement("strong", null, value),
    React.createElement("span", null, label),
    sub && React.createElement("small", null, sub)); }
function ResultsFn({ id, go }) {
    const [res, setRes] = useState(null), [error, setError] = useState(''), [selected, setSelected] = useState(null);
    useEffect(() => { let ok = true; (id === 'multiplayer' ? multiplayerRequest('results') : API.results(id)).then(d => { if (ok)
        setRes(d); }).catch(e => { if (ok)
        setError(e.message); }); return () => { ok = false; }; }, [id]);
    if (error)
        return React.createElement("div", { className: "inner-page wrap error-page" },
            React.createElement(Eyebrow, null, "REPORT UNAVAILABLE"),
            React.createElement("h1", null,
                "NOT QUITE ",
                React.createElement("em", null, "YET.")),
            React.createElement("p", null, error),
            React.createElement("button", { className: "btn btn-primary", onClick: () => go(id === 'multiplayer' ? '/multiplayer/arena' : '/arena/' + id) },
                "RETURN TO SESSION ",
                React.createElement(Arrow, null)));
    if (!res)
        return React.createElement(Loading, { message: "EXAMINING YOUR DECISIONS" });
    const { profile, stats, session } = res;
    const history = session.history;
    const rates = Object.entries(profile.membership || {}).sort((a, b) => b[1] - a[1]);
    return React.createElement("div", { className: "results-page" },
        session.mode === 'multiplayer' && React.createElement("section", { className: "grid-epilogue wrap" },
            React.createElement(Eyebrow, null, "THE LAST GRID / THE FINAL REVELATION"),
            React.createElement("h2", null,
                "THE FINAL CYCLE ",
                React.createElement("em", null, "IS COMPLETE.")),
            React.createElement("p", null, "The grid recorded your choices. But the real experiment was never about electricity. It was about you, your opponent, and the patterns behind every decision."),
            React.createElement("div", null,
                React.createElement("span", null, "THE POWER GRID WAS FICTIONAL"),
                React.createElement("span", null, "THE OPPONENT WAS HUMAN"),
                React.createElement("span", null, "THE AI ANALYSIS IS REAL"))),
        React.createElement("section", { className: "result-hero wrap" },
            React.createElement(Eyebrow, null, "YOUR BEHAVIORAL REPORT / EXPERIMENT COMPLETED"),
            React.createElement("div", { className: "result-hero-grid" },
                React.createElement("div", null,
                    React.createElement("span", { className: "result-precursor" }, "YOUR CLOSEST OBSERVED STRATEGY IS"),
                    React.createElement("h1", null, profile.strategy.toUpperCase().split(' ').map((part, i) => React.createElement("span", { key: i, style: { display: 'contents' } },
                        i > 0 && React.createElement("br", null),
                        React.createElement("em", null, part)))),
                    React.createElement("p", null, profile.description),
                    React.createElement("span", { className: "pill preliminary" }, "EXPLORATORY / SHORT-SESSION PROFILE")),
                React.createElement("div", { className: "result-glyph" },
                    React.createElement("div", { className: "result-ring ring-a" }),
                    React.createElement("div", { className: "result-ring ring-b" }),
                    React.createElement("div", { className: "result-ring ring-c" }),
                    React.createElement("span", null, "\u2733"),
                    React.createElement("small", null,
                        "CLUSTER ",
                        String(profile.cluster + 1).padStart(2, '0'))))),
        React.createElement("section", { className: "report-container wrap" },
            React.createElement("div", { className: "report-strip" },
                React.createElement(Stat, { value: Math.round(stats.cooperation_rate * 100) + '%', label: "COOPERATION RATE" }),
                React.createElement(Stat, { value: Math.round(stats.prediction_accuracy * 100) + '%', label: "AI PREDICTION ACCURACY", sub: `${stats.correct_predictions} / ${stats.prediction_rounds} live predictions` }),
                React.createElement(Stat, { value: stats.score_player, label: "YOUR TOTAL POINTS" }),
                React.createElement(Stat, { value: Math.round(stats.switch_rate * 100) + '%', label: "SWITCHING RATE" })),
            React.createElement("div", { className: "report-columns" },
                React.createElement("article", { className: "report-panel" },
                    React.createElement(Eyebrow, null, "01 / BEHAVIORAL SIMILARITY"),
                    React.createElement("h2", null,
                        "YOUR STRATEGY",
                        React.createElement("br", null),
                        React.createElement("em", null, "FINGERPRINT.")),
                    React.createElement("p", null, "This compares your game history with the four clusters learned from the original study. Closeness scores describe relative distance to cluster centroids; they are not calibrated probabilities or psychological confidence."),
                    React.createElement("div", { className: "similarity-list" }, rates.map(([name, p]) => React.createElement("div", { key: name, className: "similarity-row" },
                        React.createElement("div", null,
                            React.createElement("b", null, name),
                            React.createElement("span", null,
                                Math.round(p * 100),
                                " / 100")),
                        React.createElement("div", { className: "similarity-track" },
                            React.createElement("span", { style: { width: (p * 100) + '%' } })))))),
                React.createElement("article", { className: "report-panel" },
                    React.createElement(Eyebrow, null, "02 / YOUR REACTIONS"),
                    React.createElement("h2", null,
                        "THE CONSEQUENCES",
                        React.createElement("br", null),
                        React.createElement("em", null, "OF TRUST.")),
                    React.createElement("p", null, "We count what actually happened in your experiment. Some situations may not have occurred, so related conditional behavior cannot be estimated."),
                    React.createElement("div", { className: "reaction-metrics" },
                        React.createElement("div", null,
                            React.createElement("span", null, "AFTER BEING BETRAYED"),
                            React.createElement("strong", null, stats.after_betrayal_cooperation_rate === null ? 'Not enough observations' : Math.round(stats.after_betrayal_cooperation_rate * 100) + '% cooperated next')),
                        React.createElement("div", null,
                            React.createElement("span", null, "OPPONENT'S FINAL SCORE"),
                            React.createElement("strong", null,
                                stats.score_opponent,
                                " points")),
                        React.createElement("div", null,
                            React.createElement("span", null, "EXPERIMENT"),
                            React.createElement("strong", null,
                                session.mode === 'multiplayer' ? 'Human versus human' : TREAT[session.treatment],
                                " \u00B7 ",
                                session.rounds_limit,
                                " rounds"))))),
            React.createElement("article", { className: "report-panel timeline-panel" },
                React.createElement(Eyebrow, null, "03 / EVERY DECISION"),
                React.createElement("div", { className: "timeline-header" },
                    React.createElement("div", null,
                        React.createElement("h2", null,
                            "YOUR DECISION ",
                            React.createElement("em", null, "TIMELINE.")),
                        React.createElement("p", null, "Select a round to inspect the actual moves, AI prediction, and payoff.")),
                    React.createElement("span", { className: "eyebrow" }, "C = COOPERATE / D = DEFECT")),
                React.createElement("div", { className: "decision-timeline" }, history.map((r, i) => React.createElement("button", { key: i, "aria-label": `Inspect round ${i + 1}`, "aria-pressed": selected === i, className: 'timeline-mark ' + (r.player_move === 'C' ? 'cooperated' : 'defected') + (selected === i ? ' active' : ''), onClick: () => setSelected(i) },
                    React.createElement("span", null, i + 1),
                    React.createElement("b", null, r.player_move)))),
                selected !== null && React.createElement("div", { className: "round-inspection" },
                    React.createElement("strong", null,
                        "ROUND ",
                        history[selected].round.toString().padStart(2, '0')),
                    React.createElement("span", null,
                        "YOU: ",
                        NAMES[history[selected].player_move]),
                    React.createElement("span", null,
                        "OPPONENT: ",
                        NAMES[history[selected].opponent_move]),
                    React.createElement("span", null,
                        "AI GUESSED: ",
                        NAMES[history[selected].prediction.move]),
                    React.createElement("span", null,
                        "PAYOFF: +",
                        history[selected].points_player,
                        " / +",
                        history[selected].points_opponent))),
            React.createElement("div", { className: "disclaimer-panel" },
                React.createElement("span", null, "IMPORTANT CONTEXT"),
                React.createElement("p", null,
                    "This is an exploratory gameplay profile, not a psychological assessment. The K-Means model was trained on 100-round participant histories; a 12- or 25-round session can receive a different assignment. Your AI accuracy above is specific to this game, not the model's published held-out test accuracy. ",
                    session.mode === 'multiplayer' ? 'Your opponent was a real human; your decision history has not been included in the historical research dataset.' : 'The opponent was simulated.')),
            React.createElement("div", { className: "result-actions" },
                React.createElement("button", { className: "btn btn-primary", onClick: () => go('/multiplayer') },
                    "PLAY ANOTHER PERSON ",
                    React.createElement(Arrow, { diagonal: true })),
                React.createElement("button", { className: "btn btn-outline", onClick: () => go('/lab') },
                    "EXPLORE THE RESEARCH ",
                    React.createElement(Arrow, { diagonal: true })))));
}
function ResearchFn({ go }) {
    const [data, setData] = useState(null), [error, setError] = useState(''), [view, setView] = useState('models');
    useEffect(() => { let ok = true; API.research().then(r => { if (ok)
        setData(r); }).catch(e => { if (ok)
        setError(e.message); }); return () => { ok = false; }; }, []);
    return React.createElement("div", { className: "lab-page" },
        React.createElement("section", { className: "wrap lab-intro" },
            React.createElement(Eyebrow, null, "THE RESEARCH LAB / EVIDENCE BEFORE IMPRESSION"),
            React.createElement("h1", null,
                "WHERE BEHAVIOR",
                React.createElement("br", null),
                "MEETS ",
                React.createElement("em", null, "DATA.")),
            React.createElement("p", null, "The playable experiment is inspired by real research. Here is what the original human-participant dataset\u2014and our trained ML models\u2014actually reveal."),
            React.createElement("div", { className: "research-citation" },
                React.createElement("span", null, "ORIGINAL DATASET"),
                React.createElement("a", { href: "https://doi.org/10.5061/dryad.37pvmcvmk", target: "_blank", rel: "noreferrer" },
                    "Dryad / 10.5061/dryad.37pvmcvmk ",
                    React.createElement(Arrow, { diagonal: true })))),
        error && React.createElement("div", { className: "wrap error-notice" }, error),
        !data ? React.createElement(Loading, { message: "READING RESEARCH DATA" }) : React.createElement("div", { className: "page-sections" },
            React.createElement("section", { className: "lab-stats wrap" },
                React.createElement(Stat, { value: "188", label: "HUMAN PARTICIPANTS" }),
                React.createElement(Stat, { value: "100", label: "ROUNDS PER PERSON" }),
                React.createElement(Stat, { value: "18,800", label: "OBSERVED DECISIONS" }),
                React.createElement(Stat, { value: "04", label: "BEHAVIORAL PROFILES" })),
            React.createElement("section", { className: "wrap lab-section" },
                React.createElement("div", { className: "lab-section-header" },
                    React.createElement(Eyebrow, null, "01 / THE SOCIAL CONTEXT"),
                    React.createElement("h2", null,
                        "PARTNERSHIP ",
                        React.createElement("em", null, "CHANGES THE PICTURE.")),
                    React.createElement("p", null, "Descriptively, the original participants cooperated more often when they repeatedly played with the same partner. This is an association in this experiment, not a universal causal law.")),
                React.createElement("div", { className: "treat-chart" },
                    React.createElement("div", { className: "treat-item" },
                        React.createElement("div", null,
                            React.createElement("strong", null, "FIXED PARTNER"),
                            React.createElement("b", null, "56.1%")),
                        React.createElement("div", { className: "treat-track" },
                            React.createElement("i", { style: { width: '56.1%' } })),
                        React.createElement("span", null, "92 participants / same counterpart through 100 rounds")),
                    React.createElement("div", { className: "treat-item" },
                        React.createElement("div", null,
                            React.createElement("strong", null, "CHANGING PARTNERS"),
                            React.createElement("b", null, "28.5%")),
                        React.createElement("div", { className: "treat-track" },
                            React.createElement("i", { className: "warm", style: { width: '28.5%' } })),
                        React.createElement("span", null, "96 participants / new counterpart each round")))),
            React.createElement("section", { className: "lab-dark" },
                React.createElement("div", { className: "wrap lab-section" },
                    React.createElement("div", { className: "lab-section-header" },
                        React.createElement(Eyebrow, null, "02 / UNSUPERVISED LEARNING"),
                        React.createElement("h2", null,
                            "FOUR GROUPS.",
                            React.createElement("br", null),
                            React.createElement("em", null, "NO PRE-ASSIGNED LABELS.")),
                        React.createElement("p", null, "K-Means grouped people by five behavioral features: overall cooperation and cooperation rates following each of the four possible previous-round outcomes.")),
                    React.createElement("div", { className: "strategy-grid" }, data.strategies.map((s, i) => React.createElement("article", { key: s.name, className: "strategy-card" },
                        React.createElement("span", null,
                            "CLUSTER / ",
                            String(i + 1).padStart(2, '0')),
                        React.createElement("h3", null, s.name),
                        React.createElement("strong", null,
                            s.players,
                            React.createElement("small", null, " / 188 PLAYERS")),
                        React.createElement("div", { className: "strategy-bar" },
                            React.createElement("i", { style: { width: (s.profile.coop_rate * 100) + '%' } })),
                        React.createElement("p", null,
                            Math.round(s.profile.coop_rate * 100),
                            "% mean cooperation within this cluster")))),
                    React.createElement("div", { className: "note-line" },
                        "K-Means silhouette = ",
                        data.cluster_metrics.silhouette,
                        " \u00B7 Bootstrap stability ARI \u2248 ",
                        data.cluster_metrics.stability_ari,
                        ". Clusters describe behavior in this sample\u2014not psychological traits."))),
            React.createElement("section", { className: "wrap lab-section" },
                React.createElement("div", { className: "lab-section-header" },
                    React.createElement(Eyebrow, null, "03 / INSIDE THE ANALYSIS"),
                    React.createElement("h2", null,
                        "EXPLORE THE ",
                        React.createElement("em", null, "EVIDENCE.")),
                    React.createElement("p", null, "Research graphics exported from the original TrustLab notebooks. These are static original analyses, not fabricated live model results.")),
                React.createElement("div", { className: "research-tabs" },
                    React.createElement("button", { className: view === 'models' ? 'selected' : '', onClick: () => setView('models') }, "MODEL COMPARISON"),
                    React.createElement("button", { className: view === 'clusters' ? 'selected' : '', onClick: () => setView('clusters') }, "CLUSTER GEOMETRY"),
                    React.createElement("button", { className: view === 'time' ? 'selected' : '', onClick: () => setView('time') }, "BEHAVIOR OVER TIME")),
                React.createElement("div", { className: "research-figure" },
                    React.createElement("img", { loading: "lazy", alt: view === 'models' ? 'Supervised baseline and integrated model performance' : view === 'clusters' ? 'PCA view of the behavioral clustering' : 'Cooperation over rounds by partner condition', src: view === 'models' ? '/figures/11_integration_auc.png' : view === 'clusters' ? '/figures/u03_pca.png' : '/figures/u07_coop_over_rounds.png' }),
                    React.createElement("div", null,
                        React.createElement(Eyebrow, null, view === 'models' ? 'MODEL PERFORMANCE' : view === 'clusters' ? 'BEHAVIORAL STRUCTURE' : 'TEMPORAL PATTERNS'),
                        React.createElement("h3", null, view === 'models' ? 'DO STRATEGIES HELP PREDICTION?' : view === 'clusters' ? 'CAN WE SEE THE GROUPS?' : 'DO DECISIONS EVOLVE?'),
                        React.createElement("p", null, view === 'models' ? 'Adding behavioral features and strategy membership improved 12-session cross-validation ROC-AUC from 0.845 to 0.898. This is an offline historical evaluation.' : view === 'clusters' ? 'The PCA projection reduces five behavioral features to two plotted dimensions. A moderate silhouette score means the groups overlap; these are not absolute boundaries.' : 'Historical participants with fixed versus changing partners show different cooperation trajectories across repeated rounds.')))),
            React.createElement("section", { className: "lab-dark" },
                React.createElement("div", { className: "wrap lab-section lab-method" },
                    React.createElement(Eyebrow, null, "04 / METHODOLOGY"),
                    React.createElement("h2", null,
                        "PREDICTION IS NOT",
                        React.createElement("br", null),
                        React.createElement("em", null, "EXPLANATION.")),
                    React.createElement("div", { className: "method-grid" },
                        React.createElement("div", null,
                            React.createElement("span", null, "01"),
                            React.createElement("h3", null, "SUPERVISED"),
                            React.createElement("p", null, "Logistic Regression predicts the next cooperate/defect choice from preceding decisions and behavioral features. It cannot know the player's future decision when predicting.")),
                        React.createElement("div", null,
                            React.createElement("span", null, "02"),
                            React.createElement("h3", null, "UNSUPERVISED"),
                            React.createElement("p", null, "K-Means groups decision patterns without predetermined class labels. Names like Reciprocator are human interpretations after clustering.")),
                        React.createElement("div", null,
                            React.createElement("span", null, "03"),
                            React.createElement("h3", null, "INTEGRATION"),
                            React.createElement("p", null, "Strategy membership and historical rates supplement the supervised prediction. All past-history features must be generated before the outcome is observed."))),
                    React.createElement("div", { className: "note-line" }, "The website's opponents are simulations; the original 188 participants are real. Simulated visitor data is not part of the historical model evaluation."))),
            React.createElement("section", { className: "wrap lab-cta" },
                React.createElement(Eyebrow, null, "BACK TO THE EXPERIMENT"),
                React.createElement("h2", null,
                    "THE DATA IS REAL.",
                    React.createElement("br", null),
                    React.createElement("em", null, "YOUR NEXT MOVE IS UNKNOWN.")),
                React.createElement("button", { className: "btn btn-primary", onClick: () => go('/multiplayer') },
                    "PLAY TRUSTLAB ",
                    React.createElement(Arrow, { diagonal: true })))));
}
const MP_TOKEN_KEY = 'trustlab.multiplayer.token';
const MP_SEEN_KEY = 'trustlab.multiplayer.seen';
function playerToken() { return sessionStorage.getItem(MP_TOKEN_KEY) || ''; }
function multiplayerRequest(path, init = {}) {
    const token = playerToken();
    if (!token)
        return Promise.reject(new Error('No multiplayer session is active. Join a new match.'));
    return API.request('/api/multiplayer/' + path, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token } });
}
function MultiplayerJoinFn({ go, apiStatus }) {
    const [name, setName] = useState('');
    const [rounds, setRounds] = useState(12);
    const [feedback, setFeedback] = useState('challenge');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const join = async () => {
        if (!name.trim() || busy)
            return;
        setBusy(true);
        setError('');
        try {
            const joined = await API.request('/api/multiplayer/join', { method: 'POST', body: JSON.stringify({ name: name.trim(), rounds, feedback }) });
            sessionStorage.setItem(MP_TOKEN_KEY, joined.token);
            sessionStorage.setItem(MP_SEEN_KEY, '0');
            go('/multiplayer/arena');
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    return React.createElement("section", { className: "inner-page wrap setup-page mp-join-page" },
        React.createElement("div", { className: "page-intro" },
            React.createElement(Eyebrow, null, "TRUSTLAB / THE LAST GRID"),
            React.createElement("h1", null,
                "TWO DISTRICTS.",
                React.createElement("br", null),
                React.createElement("em", null, "ONE GRID.")),
            React.createElement("p", null, "Choose whether to share power or protect your own district. Across the city, a stranger faces the same decision. The AI watches how you respond.")),
        React.createElement(LastGridBriefing, null),
        React.createElement("div", { id: "mission-setup", className: "mission-setup-heading" },
            React.createElement(Eyebrow, null, "YOUR MISSION / SET UP THE EXPERIMENT"),
            React.createElement("h2", null, "YOUR DISTRICT IS WAITING."),
            React.createElement("p", null, "Enter a nickname to connect with another human controller. The next decision will be yours.")),
        React.createElement("div", { className: "setup-layout" },
            React.createElement("div", { className: "setup-form" },
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "01"),
                        React.createElement("h2", null, "NAME YOUR DISTRICT CONTROLLER")),
                    React.createElement("label", { className: "mp-label", htmlFor: "player-name" }, "DISPLAY NAME / NICKNAME"),
                    React.createElement("input", { id: "player-name", className: "mp-name-input", value: name, maxLength: "28", autoComplete: "nickname", placeholder: "What should your opponent call you?", onChange: e => setName(e.target.value), onKeyDown: e => { if (e.key === 'Enter')
                            join(); } }),
                    React.createElement("p", { className: "mp-helper" }, "Your display name is visible to your opponent. Use a nickname, not personal information.")),
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "02"),
                        React.createElement("h2", null, "NUMBER OF DECISIONS")),
                    React.createElement("div", { className: "options-two" },
                        React.createElement(OptionCard, { small: true, selected: rounds === 12, onClick: () => setRounds(12), icon: "12", kicker: "QUICK MATCH", title: "12 rounds", description: "Fast paired experiment, preliminary strategy analysis." }),
                        React.createElement(OptionCard, { small: true, selected: rounds === 25, onClick: () => setRounds(25), icon: "25", kicker: "LONG MATCH", title: "25 rounds", description: "More shared outcomes and decisions to analyze." }))),
                React.createElement("div", { className: "setup-section" },
                    React.createElement("div", { className: "section-label" },
                        React.createElement("span", null, "03"),
                        React.createElement("h2", null, "AI PREDICTION REVEAL")),
                    React.createElement("div", { className: "options-two" },
                        React.createElement(OptionCard, { small: true, selected: feedback === 'challenge', onClick: () => setFeedback('challenge'), icon: "\u2197", kicker: "AFTER EACH ROUND", title: "Challenge", description: "Find out if the AI predicted your own decision." }),
                        React.createElement(OptionCard, { small: true, selected: feedback === 'research', onClick: () => setFeedback('research'), icon: "\u2301", kicker: "AT THE END", title: "Research", description: "Keep predictions sealed until the final report." }))),
                error && React.createElement("div", { role: "alert", className: "error-notice" }, error),
                React.createElement("button", { className: "btn btn-primary btn-wide", disabled: !name.trim() || busy || apiStatus === 'offline', onClick: join },
                    busy ? 'SEARCHING FOR A MATCH…' : 'CONNECT TO ANOTHER DISTRICT',
                    " ",
                    React.createElement(Arrow, { diagonal: true })),
                React.createElement("p", { className: "disclaimer" }, "Live two-player match \u00B7 No account required \u00B7 Same round count and feedback mode \u00B7 One opponent for the full match"),
                React.createElement("div", { className: "mp-solo-alternative" },
                    React.createElement("span", null, "NO ONE ONLINE?"),
                    React.createElement("button", { className: "text-action", onClick: () => go('/setup') },
                        "TRY THE SIMULATED EXPERIMENT ",
                        React.createElement(Arrow, null)))),
            React.createElement("aside", { className: "setup-aside" },
                React.createElement("div", { className: "sticky-side" },
                    React.createElement("span", { className: "eyebrow" }, "THE LAST GRID / MISSION RULES"),
                    React.createElement("h3", null,
                        "YOUR POWER.",
                        React.createElement("br", null),
                        "YOUR CHOICE."),
                    React.createElement("p", null, "Each round is an energy-distribution cycle. You and another human decide independently to contribute or divert power. Both choices stay secret until both controllers commit."),
                    React.createElement(Payoff, { small: true }),
                    React.createElement("div", { className: "side-note" },
                        React.createElement("span", null, "BEHIND THE STORY"),
                        React.createElement("p", null, "The power grid is fictional. The scoring and AI experiment follow the repeated Prisoner\u2019s Dilemma; each player receives their own exploratory behavioral report."))))));
}
function MultiplayerArenaFn({ go }) {
    const [state, setState] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [seen, setSeen] = useState(() => Number(sessionStorage.getItem(MP_SEEN_KEY) || '0'));
    useEffect(() => {
        let alive = true;
        const fetchState = () => multiplayerRequest('state').then(v => { if (alive) {
            setState(v);
            setError('');
        } }).catch(e => { if (alive)
            setError(e.message); });
        fetchState();
        const timer = setInterval(fetchState, 1100);
        return () => { alive = false; clearInterval(timer); };
    }, []);
    const last = state?.history?.length ? state.history[state.history.length - 1] : null;
    const reveal = !!(state && last && state.completed > seen);
    const next = () => { const newSeen = state.completed; setSeen(newSeen); sessionStorage.setItem(MP_SEEN_KEY, String(newSeen)); if (state.finished)
        go('/multiplayer/results'); };
    const pick = async (move) => {
        if (!state || busy || state.status !== 'active' || state.your_choice_locked || reveal)
            return;
        setBusy(true);
        setError('');
        try {
            setState(await multiplayerRequest('move', { method: 'POST', body: JSON.stringify({ move, round: state.round }) }));
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusy(false);
        }
    };
    const quit = async () => { try {
        await multiplayerRequest('leave', { method: 'POST' });
    }
    catch (e) { } sessionStorage.removeItem(MP_TOKEN_KEY); sessionStorage.removeItem(MP_SEEN_KEY); go('/multiplayer'); };
    if (error && !state)
        return React.createElement("section", { className: "inner-page wrap error-page" },
            React.createElement(Eyebrow, null, "CONNECTION UNAVAILABLE"),
            React.createElement("h1", null,
                "YOUR MATCH",
                React.createElement("br", null),
                React.createElement("em", null, "WAS LOST.")),
            React.createElement("p", null, error),
            React.createElement("button", { className: "btn btn-primary", onClick: quit },
                "FIND A NEW MATCH ",
                React.createElement(Arrow, null)));
    if (!state)
        return React.createElement(Loading, { message: "CONNECTING TO HUMAN MATCHMAKING" });
    return React.createElement("section", { className: "arena-page wrap mp-arena-page" },
        React.createElement("div", { className: "arena-top" },
            React.createElement("div", null,
                React.createElement(Eyebrow, null, "THE LAST GRID / LIVE HUMAN EXPERIMENT"),
                React.createElement("h1", null,
                    "THE NEXT ",
                    React.createElement("em", null, "CYCLE"),
                    " IS YOURS.")),
            React.createElement("div", { className: "round-badge" },
                "ROUND ",
                React.createElement("strong", null,
                    String(state.round).padStart(2, '0'),
                    " ",
                    React.createElement("span", null,
                        "/ ",
                        state.rounds_limit)))),
        React.createElement("div", { className: "progress-track" },
            React.createElement("div", { style: { width: `${state.completed / state.rounds_limit * 100}%` } })),
        React.createElement("div", { className: "arena-meta" },
            React.createElement("span", null, "ENERGY DISTRIBUTION / SAME HUMAN PARTNER"),
            React.createElement("span", null,
                MODE[state.feedback],
                " MODE \u00B7 YOUR PREDICTIONS ",
                state.feedback === 'research' ? 'SEALED UNTIL END' : 'REVEALED AFTER ROUNDS')),
        React.createElement("div", { className: "arena-board" },
            React.createElement("div", { className: "participant player" },
                React.createElement("span", { className: "participant-label" }, "DISTRICT 01 / YOU"),
                React.createElement("div", { className: "participant-icon" }, "\u25CE"),
                React.createElement("h2", { className: "mp-player-name" }, state.player_name),
                React.createElement("span", { className: "participant-score" }, String(state.score_player).padStart(2, '0')),
                React.createElement("small", null, "TOTAL POINTS")),
            React.createElement("div", { className: "arena-center" },
                React.createElement("span", { className: "arena-center-kicker" }, "SHARED GRID / INDEPENDENT DECISIONS"),
                React.createElement("div", { className: "versus" },
                    React.createElement("span", null, "YOU"),
                    React.createElement("b", null, "VS"),
                    React.createElement("span", null, "THEM")),
                React.createElement("div", { className: "lock-statement" },
                    React.createElement("span", { className: "mini-lock" }, "\u2301"),
                    " BOTH CHOICES ARE HIDDEN"),
                React.createElement("p", null, "Share the grid, or divert energy. Neither district knows the other\u2019s choice yet.")),
            React.createElement("div", { className: "participant opponent" },
                React.createElement("span", { className: "participant-label" }, "DISTRICT 02 / REAL HUMAN"),
                React.createElement("div", { className: "participant-icon opponent-symbol" }, "\u2733"),
                React.createElement("h2", { className: "mp-player-name" }, state.opponent_name || 'SEARCHING…'),
                React.createElement("span", { className: "participant-score" }, String(state.score_opponent).padStart(2, '0')),
                React.createElement("small", null, "TOTAL POINTS"))),
        state.status === 'waiting' && React.createElement("div", { className: "mp-status-card", role: "status" },
            React.createElement("div", { className: "spinner-orbit" }),
            React.createElement("span", { className: "eyebrow" }, "MATCHMAKING IN PROGRESS"),
            React.createElement("h2", null, "SEARCHING FOR THE SECOND DISTRICT."),
            React.createElement("p", null, "Another real controller must join the same 12- or 25-cycle mode. Share this website with your classmates to connect the grid."),
            React.createElement("button", { className: "btn btn-outline", onClick: quit }, "LEAVE THE QUEUE")),
        state.status === 'interrupted' && React.createElement("div", { className: "mp-status-card", role: "alert" },
            React.createElement(Eyebrow, null, "MATCH INTERRUPTED"),
            React.createElement("h2", null, "YOUR OPPONENT LEFT."),
            React.createElement("p", null, "The current match cannot continue. Previous decisions will not be added to the research dataset."),
            React.createElement("button", { className: "btn btn-primary", onClick: quit },
                "FIND ANOTHER PLAYER ",
                React.createElement(Arrow, null))),
        state.status === 'active' && !reveal && !state.your_choice_locked && React.createElement("div", { className: "decision-zone" },
            React.createElement("span", { className: "eyebrow" },
                "YOUR DECISION / ",
                String(state.round).padStart(2, '0')),
            React.createElement("h2", null, "SHARE POWER OR DIVERT IT?"),
            React.createElement("div", { className: "choice-grid" },
                React.createElement("div", { className: "grid-choice-context" },
                    React.createElement(MoveButton, { type: "C", onClick: pick, disabled: busy }),
                    React.createElement("p", null, "SHARE POWER \u00B7 Both districts benefit if both contribute.")),
                React.createElement("div", { className: "grid-choice-context" },
                    React.createElement(MoveButton, { type: "D", onClick: pick, disabled: busy }),
                    React.createElement("p", null, "DIVERT POWER \u00B7 Secure more for yourself if the other contributes."))),
            React.createElement("p", null, "Choose deliberately. Your AI prediction was generated from previous rounds only.")),
        state.status === 'active' && !reveal && state.your_choice_locked && React.createElement("div", { className: "mp-status-card", role: "status" },
            React.createElement("div", { className: "spinner-orbit" }),
            React.createElement("span", { className: "eyebrow" }, "YOUR DECISION IS SEALED"),
            React.createElement("h2", null, "AWAITING THE OTHER DISTRICT."),
            React.createElement("p", null,
                "Your decision is locked. The grid will reveal both choices when ",
                state.opponent_name || 'the other controller',
                " commits.")),
        reveal && React.createElement("div", { className: "reveal-panel", "aria-live": "polite" },
            React.createElement("span", { className: "eyebrow" },
                "ENERGY CYCLE ",
                last.round,
                " / BOTH DECISIONS COMMITTED"),
            React.createElement("div", { className: "grid-outcome-story" },
                React.createElement("span", null, gridOutcome(last.player_move, last.opponent_move).state),
                React.createElement("h2", null, gridOutcome(last.player_move, last.opponent_move).title),
                React.createElement("p", null, gridOutcome(last.player_move, last.opponent_move).copy)),
            React.createElement("div", { className: "reveal-cards" },
                React.createElement("div", null,
                    React.createElement("span", null, "YOU CHOSE"),
                    React.createElement("strong", { className: last.player_move === 'C' ? 'green' : 'copper' }, NAMES[last.player_move]),
                    React.createElement("b", null,
                        "+",
                        last.points_player,
                        " POINTS")),
                React.createElement("div", null,
                    React.createElement("span", null,
                        state.opponent_name?.toUpperCase(),
                        " CHOSE"),
                    React.createElement("strong", { className: last.opponent_move === 'C' ? 'green' : 'copper' }, NAMES[last.opponent_move]),
                    React.createElement("b", null,
                        "+",
                        last.points_opponent,
                        " POINTS"))),
            last.prediction ? React.createElement("div", { className: "prediction-reveal" },
                React.createElement("span", null, "YOUR AI PREDICTED"),
                React.createElement("strong", null, NAMES[last.prediction.move]),
                React.createElement("span", { className: last.prediction_correct ? 'correct' : 'missed' }, last.prediction_correct ? '✓ CORRECT' : '× DIFFERENT FROM YOUR CHOICE')) : React.createElement("div", { className: "prediction-reveal" },
                React.createElement("span", null, "YOUR PREDICTION"),
                React.createElement("strong", null, "SEALED UNTIL YOUR FINAL REPORT")),
            React.createElement("button", { className: "btn btn-primary", onClick: next },
                state.finished ? 'REVEAL WHAT THE AI LEARNED' : 'BEGIN NEXT ENERGY CYCLE',
                " ",
                React.createElement(Arrow, null))),
        state.finished && !reveal && React.createElement("div", { className: "reveal-panel" },
            React.createElement("h2", null, "THE FINAL CYCLE IS COMPLETE."),
            React.createElement("p", null, "The grid has recorded every choice. The real experiment was never about electricity\u2014it was about the patterns behind your decisions. Both players now have separate AI reports."),
            React.createElement("button", { className: "btn btn-primary", onClick: () => go('/multiplayer/results') },
                "VIEW YOUR REPORT ",
                React.createElement(Arrow, null))),
        error && React.createElement("div", { role: "alert", className: "error-notice" }, error),
        React.createElement("div", { className: "arena-ledger" },
            React.createElement("div", { className: "ledger-head" },
                React.createElement("span", null, "THE GRID / DECISION HISTORY"),
                React.createElement("span", null,
                    state.completed,
                    " / ",
                    state.rounds_limit,
                    " ROUNDS")),
            React.createElement("div", { className: "ledger-dots" }, Array.from({ length: state.rounds_limit }, (_, i) => { const r = state.history[i]; return React.createElement("span", { key: i, title: r ? `Round ${i + 1}: ${NAMES[r.player_move]} vs ${NAMES[r.opponent_move]}` : `Round ${i + 1} pending`, className: 'ledger-dot ' + (r ? (r.player_move === 'C' ? 'ledger-c' : 'ledger-d') : 'ledger-empty') }, r ? (r.player_move === 'C' ? 'C' : 'D') : ''); }))),
        React.createElement("div", { className: "mp-bottom-action" },
            React.createElement("button", { className: "btn btn-link", onClick: quit }, "LEAVE THIS MATCH"),
            React.createElement("p", null, "Do not close your browser during the game. Refreshing this tab will reconnect to your session.")));
}
const MultiplayerJoin = withHooks(MultiplayerJoinFn);
const MultiplayerArena = withHooks(MultiplayerArenaFn);
const Setup = withHooks(SetupFn);
const Arena = withHooks(ArenaFn);
const Results = withHooks(ResultsFn);
const Research = withHooks(ResearchFn);
function AppFn() {
    const [route, go] = useRoute();
    const [apiStatus, setApiStatus] = useState('checking');
    useEffect(() => { API.health().then(h => setApiStatus(h.models_ready ? 'online' : 'offline')).catch(() => setApiStatus('offline')); }, []);
    let page;
    if (route === '/')
        page = React.createElement(Home, { go: go });
    else if (route === '/multiplayer')
        page = React.createElement(MultiplayerJoin, { go: go, apiStatus: apiStatus });
    else if (route === '/multiplayer/arena')
        page = React.createElement(MultiplayerArena, { go: go });
    else if (route === '/multiplayer/results')
        page = React.createElement(Results, { key: route, id: "multiplayer", go: go });
    else if (route === '/setup')
        page = React.createElement(Setup, { go: go, apiStatus: apiStatus });
    else if (route.startsWith('/arena/'))
        page = React.createElement(Arena, { key: route, id: route.substring(7), go: go });
    else if (route.startsWith('/results/'))
        page = React.createElement(Results, { key: route, id: route.substring(9), go: go });
    else if (route === '/lab')
        page = React.createElement(Research, { go: go });
    else
        page = React.createElement("div", { className: "wrap error-page" },
            React.createElement(Eyebrow, null, "404 / UNKNOWN PATH"),
            React.createElement("h1", null,
                "NOTHING HERE ",
                React.createElement("em", null, "YET.")),
            React.createElement("button", { className: "btn btn-primary", onClick: () => go('/') },
                "GO HOME ",
                React.createElement(Arrow, null)));
    return React.createElement(Shell, { route: route, go: go, apiStatus: apiStatus }, page);
}
const App = withHooks(AppFn);
if (typeof ReactDOM.createRoot === 'function') {
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));
}
else {
    ReactDOM.render(React.createElement(App, null), document.getElementById('root'));
}
