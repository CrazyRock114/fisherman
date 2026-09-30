import * as THREE from '../engine/index.js';
import { UI } from './UI.js';
import { G } from '../core/Globals.js';
import { GroundBounce } from '../materials/GroundBounce.js';
import { t, setLang, LANG } from './lang.js';

// Binds the Fisherman UI (panel + HUD) to the running app.
const SEA = {
	Calm: { wind: 3.5, fetch: 40, chop: 0.75, swell: 0.28, surf: 0.18, period: 11, whitecaps: 0.2 },
	Breezy: { wind: 7, fetch: 120, chop: 0.9, swell: 0.48, surf: 0.34, period: 9, whitecaps: 0.5 },
	Choppy: { wind: 12, fetch: 300, chop: 1.05, swell: 0.68, surf: 0.56, period: 8.5, whitecaps: 0.75 },
	Storm: { wind: 20, fetch: 900, chop: 1.2, swell: 1.0, surf: 0.9, period: 12, whitecaps: 1 },
};

export class AppUI {

	constructor( app, ui = new UI() ) {

		this.app = app;
		this.ui = ui;
		const fft = app.fft;
		const shore = app.shore;

		// ---- plain values the controls bind to; onChange pushes them into the simulation
		const s = this.s = {
			wind: fft.local.windSpeed,
			windDir: fft.local.windDirection,
			fetch: fft.local.fetch,
			chop: fft.choppiness.value,
			swell: fft.swell.scale,
			whitecaps: 0.5,
			clarity: 1,
			surf: shore.amplitude.value,
			period: shore.period.value,
			gamma: shore.gamma.value,
			curl: shore.curl.value,
			caustics: app.caustics ? app.caustics.strength.value : 1,
			time: app.settings.timeOfDay,
			advance: app.settings.timeSpeed !== 0,
			timeSpeed: app.settings.timeSpeed || 0.05,
			clouds: app.clouds ? app.clouds.coverage.value : 0.45,
			cirrus: app.clouds && app.clouds.cirrus ? app.clouds.cirrus.value : 0.5,
			exposure: 0,
			fov: app.camera.fov,
			camMode: 'third',
			ao: app.post.params.aoStrength.value,
			bloom: app.post.params.bloom.value,
			flare: app.post.flare ? app.post.flare.strength.value : 1,
			vignette: app.post.params.vignette.value,
			saturation: app.post.params.saturation.value,
			contrast: app.post.params.contrast.value,
			grain: app.post.params.grain.value,
			renderScale: app.settings.renderScale,
			shadows: true,
			lang: LANG,
		};

		const spectrum = () => {

			fft.local.windSpeed = s.wind;
			fft.local.windDirection = s.windDir;
			fft.local.fetch = s.fetch;
			fft.swell.scale = s.swell;
			fft.updateSpectrumUniforms();
			const a = THREE.MathUtils.degToRad( s.windDir );
			G.windDir.value.set( Math.cos( a ), Math.sin( a ) );
			G.windSpeed.value = s.wind;

		};

		const whitecaps = () => {

			// more whitecaps: foam starts at less compression (and more of it in fresh wind), lasts longer.
			// Only crests near breaking (strong compression) foam: a laxer threshold paints every crest line
			// with a white streak, which real open water at these wind speeds doesn't have.
			fft.foamBias.value = 0.5 + 0.16 * s.whitecaps + 0.01 * THREE.MathUtils.clamp( s.wind - 7, - 5, 12 );
			fft.foamDecay.value = 0.6 - 0.35 * s.whitecaps;

		};

		const clarity = () => {

			// scale absorption/scattering around the tropical defaults
			const k = 1 / Math.max( 0.2, s.clarity );
			G.waterAbsorption.value.set( 0.42, 0.075, 0.035 ).multiplyScalar( 0.6 + 0.4 * k );
			G.waterScattering.value.set( 0.012, 0.018, 0.024 ).multiplyScalar( k * k );

		};

		// ---------------------------------------------------------------- Ocean
		const ocean = ui.addTab( 'ocean', t( 'Ocean', '海洋' ), 'ocean' );
		const sea = ocean.addFolder( t( 'Sea state', '海况' ), { icon: 'wind' } );
		sea.addPresets( {
			label: t( 'Conditions', '海况预设' ), active: 'Breezy',
			presets: Object.keys( SEA ).map( ( k ) => ( {
				label: t( k, { Calm: '平静', Breezy: '微风', Choppy: '风浪', Storm: '风暴' }[ k ] || k ), icon: k.toLowerCase(),
				apply: () => {

					const p = SEA[ k ];
					Object.assign( s, p );
					spectrum();
					whitecaps();
					fft.choppiness.value = s.chop;
					shore.amplitude.value = s.surf;
					shore.period.value = s.period;

				},
			} ) ),
		} );
		sea.addSlider( { label: t( 'Wind speed', '风速' ), object: s, key: 'wind', min: 0.5, max: 30, step: 0.1, unit: 'm/s', tooltip: t( 'Wind 10 m above the sea. Drives the local wind waves, whitecaps and spray.', '海面上方 10 米处的风速。决定风浪、白沫和飞沫。' ), onChange: () => {

			spectrum();
			whitecaps();

		} } );
		sea.addSlider( { label: t( 'Wind direction', '风向' ), object: s, key: 'windDir', min: 0, max: 360, step: 1, unit: '°', onChange: spectrum } );
		sea.addSlider( { label: t( 'Fetch', '风区长度' ), object: s, key: 'fetch', min: 5, max: 2000, log: true, unit: 'km', tooltip: t( 'Distance the wind has blown over open water: longer fetch, longer and higher waves.', '风在开阔水面上吹过的距离：风区越长，浪越长也越大。' ), onChange: spectrum } );
		sea.addSlider( { label: t( 'Choppiness', '浪尖锐度' ), object: s, key: 'chop', min: 0, max: 1.6, step: 0.01, tooltip: t( 'Horizontal displacement: sharp crests, wide troughs.', '水平位移：波峰更尖、波谷更宽。' ), onChange: ( v ) => { fft.choppiness.value = v; } } );
		sea.addSlider( { label: t( 'Ocean swell', '涌浪' ), object: s, key: 'swell', min: 0, max: 2, step: 0.01, onChange: spectrum } );
		sea.addSlider( { label: t( 'Whitecaps', '白沫' ), object: s, key: 'whitecaps', min: 0, max: 1, step: 0.01, onChange: whitecaps } );
		const water = ocean.addFolder( t( 'Water', '水体' ), { icon: 'droplet' } );
		water.addSlider( { label: t( 'Clarity', '清澈度' ), object: s, key: 'clarity', min: 0.3, max: 2, step: 0.01, tooltip: t( 'Lower = more suspended sediment and plankton (greener, murkier).', '越低 = 悬浮泥沙与浮游生物越多（更绿、更浑浊）。' ), onChange: clarity } );

		// ---------------------------------------------------------------- Shore
		const shoreTab = ui.addTab( 'shore', t( 'Shore', '海岸' ), 'shore' );
		const surf = shoreTab.addFolder( t( 'Surf', '碎浪' ), { icon: 'wave' } );
		surf.addSlider( { label: t( 'Wave height', '浪高' ), object: s, key: 'surf', min: 0, max: 1.4, step: 0.01, unit: 'm', format: ( v ) => `${ ( v * 2 ).toFixed( 2 ) } m`, onChange: ( v ) => { shore.amplitude.value = v; } } );
		surf.addSlider( { label: t( 'Wave period', '浪周期' ), object: s, key: 'period', min: 5, max: 16, step: 0.1, unit: 's', onChange: ( v ) => { shore.period.value = v; } } );
		surf.addSlider( { label: t( 'Breaking depth ratio', '破碎水深比' ), object: s, key: 'gamma', min: 0.5, max: 1.1, step: 0.01, tooltip: t( 'Waves break when height exceeds this fraction of the depth.', '浪高超过水深的这个比例时开始破碎。' ), onChange: ( v ) => { shore.gamma.value = v; } } );
		surf.addSlider( { label: t( 'Curl', '卷曲度' ), object: s, key: 'curl', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { shore.curl.value = v; } } );
		if ( app.breakers ) {

			s.spray = app.breakers.params.spray.value;
			s.lip = app.breakers.params.sheet.value;
			surf.addSlider( { label: t( 'Spray', '飞沫' ), object: s, key: 'spray', min: 0, max: 2, step: 0.01, tooltip: t( 'Droplets and mist thrown off breaking crests.', '碎浪浪峰抛出的水滴与水雾。' ), onChange: ( v ) => { app.breakers.params.spray.value = v; } } );
			surf.addSlider( { label: t( 'Lip sheet', '卷跃水膜' ), object: s, key: 'lip', min: 0, max: 1.5, step: 0.01, tooltip: t( 'The thin sheet of water thrown forward by plunging breakers.', '卷碎浪向前抛出的薄薄水膜。' ), onChange: ( v ) => { app.breakers.params.sheet.value = v; } } );

		}

		if ( app.wake ) {

			const boat = shoreTab.addFolder( t( 'Boat wake', '航迹' ), { icon: 'wave', open: false } );
			s.wakeHeight = app.wake.amplitude.value;
			s.wakeFoam = app.wake.foamGain.value;
			boat.addSlider( { label: t( 'Wake height', '航迹浪高' ), object: s, key: 'wakeHeight', min: 0, max: 2, step: 0.01, onChange: ( v ) => { app.wake.amplitude.value = v; } } );
			boat.addSlider( { label: t( 'Wake foam', '航迹泡沫' ), object: s, key: 'wakeFoam', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { app.wake.foamGain.value = v; } } );

		}
		if ( app.caustics ) {

			const light = shoreTab.addFolder( t( 'Caustics', '焦散' ), { icon: 'sun', open: false } );
			light.addSlider( { label: t( 'Intensity', '强度' ), object: s, key: 'caustics', min: 0, max: 2, step: 0.01, onChange: ( v ) => { app.caustics.strength.value = v; } } );

		}

		// ---------------------------------------------------------------- Sky
		const sky = ui.addTab( 'sky', t( 'Sky', '天空' ), 'sky' );
		const sun = sky.addFolder( t( 'Sun', '太阳' ), { icon: 'clock' } );
		sun.addTimeOfDay( { object: app.settings, key: 'timeOfDay' } );
		sun.addSlider( { label: t( 'Sun azimuth', '太阳方位' ), object: app.settings, key: 'sunAzimuth', min: - 180, max: 180, step: 1, format: ( v ) => `${ Math.round( v ) }°`, tooltip: t( 'Turns the sun\'s path around the island (0 = the real path: rises in the east, sets in the west).', '让太阳的路径绕岛旋转（0 = 真实路径：东升西落）。' ) } );
		let speed = null;
		sun.addToggle( { label: t( 'Advance time', '时间流逝' ), object: s, key: 'advance', onChange: ( v ) => {

			app.settings.timeSpeed = v ? s.timeSpeed : 0;
			speed.setVisible( v );

		} } );
		speed = sun.addSlider( { label: t( 'Time speed', '时间速度' ), object: s, key: 'timeSpeed', min: 0.002, max: 1, log: true, unit: 'h/s', onChange: ( v ) => { if ( s.advance ) app.settings.timeSpeed = v; } } ).setVisible( s.advance );
		const atmo = sky.addFolder( t( 'Atmosphere', '大气' ), { icon: 'cloud' } );
		if ( app.clouds ) atmo.addSlider( { label: t( 'Cloud cover', '云量' ), object: s, key: 'clouds', min: 0, max: 1, step: 0.01, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => { app.clouds.coverage.value = v; } } );
		if ( app.clouds && app.clouds.cirrus ) atmo.addSlider( { label: t( 'Cirrus', '卷云' ), object: s, key: 'cirrus', min: 0, max: 1, step: 0.01, format: ( v ) => `${ Math.round( v * 100 ) }%`, onChange: ( v ) => { app.clouds.cirrus.value = v; } } );
		if ( app.haze ) {

			s.haze = app.haze.density.value;
			s.shafts = app.haze.shafts.value;
			atmo.addSlider( { label: t( 'Haze', '雾霭' ), object: s, key: 'haze', min: 0, max: 4, step: 0.05, tooltip: t( 'Aerial perspective and marine haze density (1 = about 20 km visibility at sea level, 0 = clear air).', '空气透视与海雾密度（1 ≈ 海平面约 20 公里能见度，0 = 空气通透）。' ), onChange: ( v ) => { app.haze.density.value = v; } } );
			atmo.addSlider( { label: t( 'Sun shafts', '光柱' ), object: s, key: 'shafts', min: 0, max: 3, step: 0.05, tooltip: t( 'Volumetric light shafts and crepuscular rays in the haze (shadows of palms, the pier, hills and clouds). 0 turns them off.', '雾霭中的体积光柱与曙暮光（棕榈、码头、山丘和云的影子）。0 为关闭。' ), onChange: ( v ) => { app.haze.shafts.value = v; } } );

		}
		if ( app.airMotes ) {

			s.air = app.airMotes.intensity.value;
			atmo.addSlider( { label: t( 'Air particles', '空气微粒' ), object: s, key: 'air', min: 0, max: 2, step: 0.01, tooltip: t( 'Dust, pollen, salt haze, seed fluff and the odd gnat drifting in the air: they catch the light when backlit by the sun. 0 turns them off.', '空气中飘浮的尘埃、花粉、盐雾、种絮和偶尔的小虫：逆光时会被照亮。0 为关闭。' ), onChange: ( v ) => { app.airMotes.intensity.value = v; } } );

		}

		atmo.addSlider( { label: t( 'Exposure', '曝光' ), object: s, key: 'exposure', min: - 3, max: 3, step: 0.1, unit: 'EV', onChange: ( v ) => { app.settings.exposure = 0.55 * Math.pow( 2, v ); } } );

		// ---------------------------------------------------------------- Camera
		const cam = ui.addTab( 'camera', t( 'Camera', '相机' ), 'camera' );
		const view = cam.addFolder( t( 'View', '视角' ), { icon: 'camera' } );
		view.addSelect( { label: t( 'Boat camera', '船上视角' ), object: s, key: 'camMode', options: [ { label: t( '1st person', '第一人称' ), value: 'first' }, { label: t( '3rd person', '第三人称' ), value: 'third' } ], onChange: ( v ) => { app.player.camMode = v; } } );
		view.addSlider( { label: t( 'Field of view', '视场角' ), object: s, key: 'fov', min: 35, max: 100, step: 1, unit: '°', onChange: ( v ) => {

			app.camera.fov = v;
			app.camera.updateProjectionMatrix();

		} } );
		view.addButton( { label: t( 'Free camera (F)', '自由视角 (F)' ), icon: 'camera', onClick: () => app.setFreeCam( ! app.freeCam ) } );

		// ---------------------------------------------------------------- Effects
		const fx = ui.addTab( 'effects', t( 'Effects', '特效' ), 'effects' );
		const post = fx.addFolder( t( 'Post-processing', '后处理' ), { icon: 'sparkles' } );
		const P = app.post.params;
		post.addSlider( { label: t( 'Ambient occlusion', '环境光遮蔽' ), object: s, key: 'ao', min: 0, max: 1.5, step: 0.01, onChange: ( v ) => { P.aoStrength.value = v; } } );
		s.bounce = GroundBounce.strength.value;
		post.addSlider( { label: t( 'Bounce light', '地面反光' ), object: s, key: 'bounce', min: 0, max: 2, step: 0.01, tooltip: t( 'Sunlight reflected off the ground (bright sand) onto undersides and shaded faces: pier, eaves, hulls, trunks. 0 = off.', '阳光被地面（亮沙）反射到背面与阴影面：码头、屋檐、船壳、树干。0 为关闭。' ), onChange: ( v ) => { GroundBounce.strength.value = v; } } );
		s.sharpen = P.sharpen.value;
		post.addSlider( { label: t( 'Sharpen', '锐化' ), object: s, key: 'sharpen', min: 0, max: 1, step: 0.01, tooltip: t( 'Contrast-adaptive sharpening after the temporal anti-aliasing.', '时序抗锯齿之后的对比度自适应锐化。' ), onChange: ( v ) => { P.sharpen.value = v; } } );
		if ( app.post.motionBlur ) {

			const mb = app.post.motionBlur.shutter;
			s.motionBlur = mb.value;
			post.addSlider( { label: t( 'Motion blur', '运动模糊' ), object: s, key: 'motionBlur', min: 0, max: 1, step: 0.05, format: ( v ) => v > 0 ? `${ Math.round( v * 360 ) }°` : t( 'Off', '关' ), tooltip: t( 'Camera and object motion blur, as a shutter angle (180° = film look). 0 turns it off.', '相机与物体的运动模糊，以快门角度表示（180° = 电影感）。0 为关闭。' ), onChange: ( v ) => { mb.value = v; } } );

		}

		post.addSlider( { label: t( 'Bloom', '辉光' ), object: s, key: 'bloom', min: 0, max: 0.3, step: 0.005, onChange: ( v ) => { P.bloom.value = v; } } );
		if ( app.post.flare ) post.addSlider( { label: t( 'Lens flare', '镜头光斑' ), object: s, key: 'flare', min: 0, max: 2, step: 0.05, onChange: ( v ) => { app.post.flare.strength.value = v; } } );
		post.addSlider( { label: t( 'Saturation', '饱和度' ), object: s, key: 'saturation', min: 0.5, max: 1.5, step: 0.01, onChange: ( v ) => { P.saturation.value = v; } } );
		post.addSlider( { label: t( 'Contrast', '对比度' ), object: s, key: 'contrast', min: 0.8, max: 1.3, step: 0.01, onChange: ( v ) => { P.contrast.value = v; } } );
		post.addSlider( { label: t( 'Vignette', '暗角' ), object: s, key: 'vignette', min: 0, max: 1, step: 0.01, onChange: ( v ) => { P.vignette.value = v; } } );
		post.addSlider( { label: t( 'Film grain', '胶片噪点' ), object: s, key: 'grain', min: 0, max: 0.06, step: 0.001, onChange: ( v ) => { P.grain.value = v; } } );

		// ---------------------------------------------------------------- Performance
		const perf = ui.addTab( 'performance', t( 'Performance', '性能' ), 'performance' );
		const live = perf.addFolder( t( 'Live', '实时' ), { icon: 'gauge' } );
		live.addInfo( { label: t( 'Frame rate', '帧率' ), get: () => `${ ( app.fps || 0 ).toFixed( 0 ) } fps` } );
		live.addInfo( { label: t( 'CPU per frame', '每帧 CPU' ), get: () => `${ ( app.cpuMs || 0 ).toFixed( 2 ) } ms` } );
		live.addInfo( { label: t( 'Render size', '渲染尺寸' ), get: () => `${ app.sceneRenderer.width } × ${ app.sceneRenderer.height }` } );
		const quality = perf.addFolder( t( 'Quality', '画质' ), { icon: 'layers' } );
		quality.addSlider( { label: t( 'Render scale', '渲染比例' ), object: s, key: 'renderScale', min: 0.5, max: 1, step: 0.05, format: ( v ) => `${ Math.round( v * 100 ) }%`, tooltip: t( 'Internal resolution; the temporal upscaler reconstructs the full output resolution.', '内部分辨率；时序升采样会重建完整输出分辨率。' ), onChange: ( v ) => app.setRenderScale( v ) } );
		// anti-aliasing: the TAA with 2..16 jitter positions averaged per pixel, or none
		s.aa = app.post.aaMode === 'none' ? 0 : app.post.taau.jitterPhaseOverride;
		quality.addSelect( { label: t( 'Anti-aliasing', '抗锯齿' ), object: s, key: 'aa', tooltip: t( 'Temporal anti-aliasing: each pixel averages this many sub-pixel sample positions over successive frames (it also smooths dithered fades and shadow noise). More samples cost nothing per frame but take a few more frames to settle.', '时序抗锯齿：每个像素在连续多帧里平均这么多个亚像素采样位置（同时平滑抖动淡化和阴影噪声）。更多采样不增加每帧成本，但需要更多帧收敛。' ), options: [ { label: t( 'Off', '关' ), value: 0 }, { label: '2x', value: 2 }, { label: '4x', value: 4 }, { label: '8x', value: 8 }, { label: '16x', value: 16 } ], onChange: ( v ) => {

			const n = Number( v );
			app.post.aaMode = n > 0 ? 'taa' : 'none';
			if ( n > 0 ) app.post.taau.jitterPhaseOverride = n;

		} } );
		quality.addToggle( { label: t( 'Shadows', '阴影' ), object: s, key: 'shadows', onChange: ( v ) => { app.shadows.enabled = v; } } );
		s.ssr = true;
		quality.addToggle( { label: t( 'Water reflections', '水面反射' ), object: s, key: 'ssr', tooltip: t( 'Screen-space reflections of the pier, boats and hills on the water.', '码头、船只和山丘在水面上的屏幕空间反射。' ), onChange: ( v ) => { app.waterMaterial.params.ssr.value = v ? 1 : 0; } } );
		quality.addSelect( { label: t( 'Language', '语言' ), object: s, key: 'lang', options: [ { label: '中文', value: 'zh' }, { label: 'English', value: 'en' } ], onChange: ( v ) => setLang( v ) } );

		// quality presets: the knobs that actually move the frame cost, persisted separately from the
		// game save (settings are per device, the save is portable)
		const QUALITY = {
			low: { renderScale: 0.6, aa: 0, shadows: false, ssr: false, aoSamples: 8, cloudScale: 0.5 },
			medium: { renderScale: 0.8, aa: 4, shadows: true, ssr: true, aoSamples: 12, cloudScale: 0.75 },
			high: { renderScale: 1, aa: 8, shadows: true, ssr: true, aoSamples: 12, cloudScale: 1 },
		};
		const applyQuality = ( k ) => {

			const q = QUALITY[ k ];
			if ( ! q ) return;
			s.quality = k;
			s.renderScale = q.renderScale;
			app.setRenderScale( q.renderScale );
			s.aa = q.aa;
			app.post.aaMode = q.aa > 0 ? 'taa' : 'none';
			if ( q.aa > 0 ) app.post.taau.jitterPhaseOverride = q.aa;
			s.shadows = q.shadows;
			app.shadows.enabled = q.shadows;
			s.ssr = q.ssr;
			app.waterMaterial.params.ssr.value = q.ssr ? 1 : 0;
			if ( app.post.aoPass ) app.post.aoPass.samples.value = q.aoSamples; // GTAO rebuilds on change
			if ( app.clouds ) app.clouds.resolutionScale = q.cloudScale;
			ui.refresh();

		};

		let savedQuality = null;
		try {

			savedQuality = localStorage.getItem( 'tidewater-quality' );

		} catch ( e ) { /* blocked storage: defaults are fine */ }

		if ( savedQuality && QUALITY[ savedQuality ] ) applyQuality( savedQuality );
		s.quality = savedQuality && QUALITY[ savedQuality ] ? savedQuality : 'high';
		quality.addSelect( { label: t( 'Preset', '预设' ), object: s, key: 'quality', options: { [ t( 'Low', '低' ) ]: 'low', [ t( 'Medium', '中' ) ]: 'medium', [ t( 'High', '高' ) ]: 'high' }, onChange: ( v ) => {

			applyQuality( v );
			try {

				localStorage.setItem( 'tidewater-quality', v );

			} catch ( e ) { /* blocked storage: applies for this session only */ }

			ui.toast( t( 'Quality:', '画质：' ) + ' ' + v );

		} } );

		// save data: the cooler lives in this browser; export / import moves it between devices
		const state = app.game && app.game.state;
		if ( state ) {

			const data = perf.addFolder( t( 'Save data', '存档' ), { icon: 'info', open: false } );
			data.addButton( { label: t( 'Export save (copy to clipboard)', '导出存档（复制到剪贴板）' ), icon: 'check', onClick: async () => {

				const json = state.exportSave();
				try {

					await navigator.clipboard.writeText( json );
					ui.toast( t( 'Save copied to the clipboard', '存档已复制到剪贴板' ) );

				} catch ( e ) {

					window.prompt( t( 'Copy your save (select all, then copy):', '复制你的存档（全选后复制）：' ), json );

				}

			} } );
			data.addButton( { label: t( 'Import save (paste a save)', '导入存档（粘贴存档内容）' ), icon: 'reset', onClick: async () => {

				const json = window.prompt( t( 'Paste the save to import:', '粘贴要导入的存档：' ) );
				if ( ! json ) return;
				ui.toast( state.importSave( json ) ? t( 'Save imported', '存档已导入' ) : t( 'That does not look like a Fisherman save', '这看起来不是 Fisherman 的存档' ) );

			} } );

		}

		this._t = 0;

	}

	// per-frame HUD
	update( dt ) {

		const app = this.app;
		const ui = this.ui;
		ui.setStats( { fps: app.fps, frameMs: dt * 1000 } );
		this.s.renderScale = app.post.scale;

		const p = app.player;
		if ( app.freeCam ) {

			ui.setMode( t( 'Free camera', '自由视角' ) );
			ui.setPrompt( 'F', t( 'Walk', '步行' ) );
			ui.setBoatGauges( { visible: false } );
			ui.setDepth( { visible: false } );
			return;

		}

		const mode = p.mode === 'boat' ? ( p.camMode === 'first' ? t( 'Boat · 1st person', '船 · 第一人称' ) : t( 'Boat · 3rd person', '船 · 第三人称' ) )
			: p.mode === 'deck' ? t( 'On deck', '甲板上' )
			: p.mode === 'swim' ? ( app.camera.position.y < ( app.cameraWaterHeight ?? 0 ) - 0.3 ? t( 'Diving', '潜水' ) : t( 'Swimming', '游泳' ) ) : t( 'Walking', '步行' );
		ui.setMode( mode );
		if ( p.prompt ) ui.setPrompt( p.prompt.key, p.prompt.text );
		else ui.setPrompt( null );

		const b = app.boatCtl;
		if ( p.mode === 'boat' ) {

			const f = b.forward( new THREE.Vector3() );
			ui.setBoatGauges( {
				visible: true,
				throttle: b.throttle,
				rpm: b.rpm,
				speedKnots: b.speed * 1.94384,
				heading: ( THREE.MathUtils.radToDeg( Math.atan2( f.x, - f.z ) ) + 360 ) % 360,
			} );

		} else ui.setBoatGauges( { visible: false } );

		const depth = ( app.cameraWaterHeight ?? 0 ) - app.camera.position.y;
		ui.setDepth( { visible: p.mode === 'swim' && depth > 0.3, meters: depth } );

	}

}
