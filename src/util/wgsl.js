// WGSL float literal helper shared across the codebase. WGSL has no int → float coercion in all
// positions (a JS number like 2 injected into WGSL is read as `2`, an int expression), so every
// constant goes through this: 2 → "2.0", 0.35 → "0.35" (numbers that stringify with an exponent
// or a dot pass through unchanged).
export const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};
