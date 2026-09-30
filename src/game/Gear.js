// Gear and upgrade data. The upgrade shop (a vendor by the boathouse) is not built yet; everything
// the game reads goes through gearStats( state.upgrades ), so buying a level is just
// state.upgrades[ key ]++ and the stats follow.
//
// Each track: levels[ 0 ] is what you start with; cost is the price of that level (0 for the first).
// `zh` / `zhLabel` are the Chinese display strings (src/ui/lang.js picks).
export const UPGRADES = {
	// rod and reel
	line: { name: 'Fishing line', zh: '鱼线', levels: [
		{ cost: 0, label: '8 lb mono', zhLabel: '8磅单丝线', lineKg: 7 },
		{ cost: 60, label: '15 lb mono', zhLabel: '15磅单丝线', lineKg: 13 },
		{ cost: 180, label: '30 lb braid', zhLabel: '30磅编织线', lineKg: 26 },
		{ cost: 450, label: '60 lb braid', zhLabel: '60磅编织线', lineKg: 50 },
	] },
	reel: { name: 'Reel', zh: '渔轮', levels: [
		{ cost: 0, label: 'Old spinning reel', zhLabel: '旧纺车轮', reelSpeed: 1.1 },
		{ cost: 90, label: 'Smooth spinning reel', zhLabel: '顺滑纺车轮', reelSpeed: 1.6 },
		{ cost: 320, label: 'Conventional reel', zhLabel: '鼓轮', reelSpeed: 2.2 },
	] },
	rod: { name: 'Rod', zh: '鱼竿', levels: [
		{ cost: 0, label: 'Hand-me-down rod', zhLabel: '旧鱼竿', castM: 22 },
		{ cost: 75, label: '7 ft graphite rod', zhLabel: '7英尺碳素竿', castM: 32 },
		{ cost: 260, label: '9 ft surf rod', zhLabel: '9英尺远投竿', castM: 45 },
	] },
	// boat
	hold: { name: 'Fish hold', zh: '鱼舱', levels: [
		{ cost: 0, label: 'Cooler', zhLabel: '保温箱', holdKg: 30 },
		{ cost: 120, label: 'Ice chest', zhLabel: '冰柜', holdKg: 70 },
		{ cost: 400, label: 'Insulated fish hold', zhLabel: '隔热鱼舱', holdKg: 160 },
	] },
	fuel: { name: 'Fuel tank', zh: '油箱', levels: [
		{ cost: 0, label: '40 L tank', zhLabel: '40升油箱', fuelL: 40 },
		{ cost: 150, label: '80 L tank', zhLabel: '80升油箱', fuelL: 80 },
		{ cost: 380, label: '150 L tank', zhLabel: '150升油箱', fuelL: 150 },
	] },
	engine: { name: 'Engine', zh: '发动机', levels: [
		{ cost: 0, label: 'Tired diesel', zhLabel: '老旧柴油机', speedMul: 1 },
		{ cost: 300, label: 'Rebuilt diesel', zhLabel: '翻新柴油机', speedMul: 1.15 },
		{ cost: 700, label: 'Turbo diesel', zhLabel: '涡轮增压柴油机', speedMul: 1.3 },
	] },
	fishFinder: { name: 'Fish finder', zh: '探鱼器', levels: [
		{ cost: 0, label: 'None', zhLabel: '无', finder: false },
		{ cost: 250, label: 'Fish finder (depth and fish on the HUD)', zhLabel: '探鱼器（HUD 显示水深与鱼群）', finder: true },
	] },
	lights: { name: 'Boat lights', zh: '船灯', levels: [
		{ cost: 0, label: 'Nav lights only', zhLabel: '仅航行灯', deckLights: false },
		{ cost: 140, label: 'Deck floodlights for night fishing', zhLabel: '夜钓甲板泛光灯', deckLights: true },
	] },
};

export const FUEL_PRICE = 1.5; // $ per litre of diesel at the chandlery
// litres per second at the helm: idle plus a lot more at full rpm (40 L lasts ~25 min flat out)
export function fuelBurn( rpm ) {

	return 0.0025 + 0.024 * rpm * rpm;

}

// next level of a track, or null when maxed
export function nextLevel( upgrades, key ) {

	const lv = UPGRADES[ key ].levels;
	const i = ( upgrades[ key ] | 0 ) + 1;
	return i < lv.length ? { index: i, ...lv[ i ] } : null;

}

export function defaultUpgrades() {

	const u = {};
	for ( const k in UPGRADES ) u[ k ] = 0;
	return u;

}

// merged stats of the current levels
export function gearStats( upgrades ) {

	const s = {};
	for ( const k in UPGRADES ) {

		const lv = UPGRADES[ k ].levels;
		const i = Math.max( 0, Math.min( lv.length - 1, upgrades[ k ] | 0 ) );
		for ( const [ key, v ] of Object.entries( lv[ i ] ) ) if ( key !== 'cost' && key !== 'label' && key !== 'zhLabel' ) s[ key ] = v;

	}

	return s;

}
