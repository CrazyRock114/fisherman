// Language: 'en' | 'zh'. Picked once per device — ?lang=zh wins, then the saved choice, then the
// browser language. t( en, zh ) returns the string for the active language: the English text stays
// in place as both the key and the fallback, so a missing translation degrades to English.
const saved = ( () => {

	try {

		return localStorage.getItem( 'tidewater-lang' );

	} catch ( e ) {

		return null;

	}

} )();

const query = typeof location !== 'undefined' ? /[?&]lang=(zh|en)\b/.exec( location.search ) : null;
const browser = typeof navigator !== 'undefined' && /^zh/i.test( navigator.language || '' ) ? 'zh' : 'en';

export let LANG = query ? query[ 1 ] : saved || browser;

export function setLang( lang ) {

	if ( lang === LANG ) return;
	try {

		localStorage.setItem( 'tidewater-lang', lang );

	} catch ( e ) { /* blocked storage: applies for this session only */ }

	// every surface bakes its strings when built — a reload applies the choice everywhere, instantly
	window.location.reload();

}

export function t( en, zh ) {

	return LANG === 'zh' ? ( zh ?? en ) : en;

}

// fish and gear names read their zh field from the data tables
export function nameOf( entry ) {

	return LANG === 'zh' && entry && entry.zh ? entry.zh : ( entry ? entry.name : '' );

}

// the loader is static HTML (index.html), painted before any module runs: swap its text as soon as
// main.js executes so a Chinese session never sees an English loader
export function applyLoaderLang() {

	if ( LANG !== 'zh' || typeof document === 'undefined' ) return;
	const q = ( s ) => document.querySelector( s );
	const set = ( s, html ) => {

		const el = q( s );
		if ( el ) el.innerHTML = html;

	};

	set( '.loader-kicker', '一座海岛的钓鱼游戏' );
	set( '.loader-tagline', '把船开出去，逛礁盘和深水，天黑前把渔获卖给乔。' );
	set( '.loader-note', '首次启动需要编译数百个着色器，可能要一两分钟。之后再进会快很多。' );
	set( '.loader-tip-label', '小贴士' );
	const tips = [
		'按 <kbd>R</kbd> 拿出鱼竿。按住左键蓄力，松开抛投：按得越久抛得越远。',
		'盯住浮标。先是轻轻点动，然后被<b>拉进水里</b>：那一瞬间点左键刺鱼。',
		'搏鱼时按住收线，但要让张力保持在绿色区间。鱼冲刺时就松手，否则断线。',
		'钓点什么取决于位置：浅滩、码头、礁盘，以及深水线外的深海，还有时间。',
		'码头旁鱼摊的<b>乔</b>收购渔获。鱼按重量计价，把大的带回来。',
		'<b>玛尔塔</b>的杂货店卖升级：更结实的线、更快的轮、更大的鱼舱、更多燃油和探鱼器。',
		'在船边按 <kbd>E</kbd> 登船，到舵前再按 <kbd>E</kbd> 掌舵；再按 <kbd>E</kbd> 离开舵位在甲板上走动。',
		'按 <kbd>I</kbd> 打开鱼箱和鱼类图鉴。玛尔塔卖的甲板灯让你夜钓无忧。',
	];
	q( '.loader-tip-list' )?.querySelectorAll( 'p' ).forEach( ( p, i ) => {

		if ( tips[ i ] ) p.innerHTML = tips[ i ];

	} );
	const fps = q( '#fps' );
	if ( fps && /fps/.test( fps.textContent ) ) fps.textContent = '-- 帧率';

}
