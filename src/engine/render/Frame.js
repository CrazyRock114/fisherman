import { UniformBlock } from '../gpu/Uniforms.js';
import { setFrameUniforms } from '../gpu/Shader.js';
import { Vector2, Vector3, Vector4, Matrix4, Color } from '../math/index.js';

// Per-frame uniforms visible to every shader as `frame` (group 0, binding 0).
//
// Camera matrices are written by the renderer for the camera being drawn. `viewProj` includes the
// sub-pixel TAA jitter; `viewProjNoJitter` / `prevViewProjNoJitter` are for motion vectors.
// The simulation globals (the former Globals.js `G` uniforms) live here too: `G.sunDir.value` is the
// handle of `frame.sunDir` and so on, so CPU code keeps its `.value` accessors.
const FRAME_FIELDS = {
	view: 'mat4x4f',
	proj: 'mat4x4f',
	viewProj: 'mat4x4f',
	invView: 'mat4x4f',
	invProj: 'mat4x4f',
	invViewProj: 'mat4x4f',
	viewProjNoJitter: 'mat4x4f',
	prevViewProjNoJitter: 'mat4x4f',
	cameraPos: [ 'vec3f', new Vector3() ],
	near: [ 'f32', 0.1 ],
	prevCameraPos: [ 'vec3f', new Vector3() ],
	far: [ 'f32', 60000 ],
	// internal render size (px) and its inverse; output (canvas) size
	resolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	invResolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	outputResolution: [ 'vec2f', new Vector2( 1, 1 ) ],
	// sub-pixel jitter in NDC units (applied in viewProj)
	jitter: [ 'vec2f', new Vector2() ],
	// last frame's jitter (NDC): last frame's buffers were rendered with it (prevViewProjNoJitter + this)
	prevJitter: [ 'vec2f', new Vector2() ],
	frameIndex: [ 'u32', 0 ],
	time: [ 'f32', 0 ], // simulation time (s)
	dt: [ 'f32', 1 / 60 ],
	seaLevel: [ 'f32', 0 ],

	// Sun (or moon at night) direction, pointing toward the light.
	sunDir: [ 'vec3f', new Vector3( 0.3, 0.6, - 0.7 ).normalize() ],
	night: [ 'f32', 0 ], // 0 = day, 1 = full night
	// Radiance-scaled irradiance of the sun at sea level after atmospheric extinction.
	sunColor: [ 'vec3f', new Color( 1, 1, 1 ) ],
	exposure: [ 'f32', 1 ],
	// Hemispherical sky irradiance at sea level (cosine-weighted, divided by PI).
	skyIrradiance: [ 'vec3f', new Color( 0.3, 0.4, 0.6 ) ],
	cameraUnderwater: [ 'f32', 0 ],
	// Average horizon sky color (fog / aerial perspective fallback).
	horizonColor: [ 'vec3f', new Color( 0.6, 0.7, 0.8 ) ],
	cameraWaterHeight: [ 'f32', 0 ],
	// Water optical properties (per meter).
	waterAbsorption: [ 'vec3f', new Vector3( 0.42, 0.075, 0.035 ) ],
	windSpeed: [ 'f32', 7 ], // m/s at 10 m height
	waterScattering: [ 'vec3f', new Vector3( 0.012, 0.018, 0.024 ) ],
	envIntensity: [ 'f32', 1 ],
	// direction the wind blows toward
	windDir: [ 'vec2f', new Vector2( 0.35, 0.94 ).normalize() ],
	// 1 when the frame renders with reversed depth (always, except shadow maps)
	reversedDepth: [ 'f32', 1 ],
	pad0: [ 'f32', 0 ],
	// free slots for experiments / debug views
	debug: [ 'vec4f', new Vector4() ],
};

const CAMERA_FIELDS = [ 'view', 'proj', 'viewProj', 'invView', 'invProj', 'invViewProj', 'viewProjNoJitter', 'prevViewProjNoJitter',
	'cameraPos', 'near', 'prevCameraPos', 'far', 'resolution', 'invResolution', 'jitter', 'prevJitter', 'reversedDepth' ];

// The main frame block (main camera; also what compute shaders see).
export const FrameUniforms = new UniformBlock( 'Frame', FRAME_FIELDS, { label: 'frame' } );

setFrameUniforms( FrameUniforms );

// Extra views (shadow cascades, cube faces, reflection cameras): same struct, own buffer and own
// camera fields; every other field follows the main block. A buffer can only hold one value per
// submit, so each camera drawn in a frame needs its own view block.
export function createViewUniforms( label ) {

	const block = new UniformBlock( 'Frame', FRAME_FIELDS, { label } );
	block.onBeforePack = () => {

		for ( const k of FrameUniforms.order ) if ( ! CAMERA_FIELDS.includes( k ) ) block.fields[ k ].value = FrameUniforms.fields[ k ].value;

	};
	return block;

}

const F = FrameUniforms.fields;

// Shared simulation state (same names as the three.js version's Globals.js).
export const G = {
	time: F.time,
	dt: F.dt,
	seaLevel: F.seaLevel,
	sunDir: F.sunDir,
	sunColor: F.sunColor,
	skyIrradiance: F.skyIrradiance,
	horizonColor: F.horizonColor,
	waterAbsorption: F.waterAbsorption,
	waterScattering: F.waterScattering,
	cameraUnderwater: F.cameraUnderwater,
	cameraWaterHeight: F.cameraWaterHeight,
	exposure: F.exposure,
	windDir: F.windDir,
	windSpeed: F.windSpeed,
	night: F.night,
	envIntensity: F.envIntensity,
};

export const GRAVITY = 9.81;

const _m = new Matrix4();

// Private per-block scratch: setFrameCamera runs for every camera and pass, so the field handles
// adopt these objects on first use and only their contents change afterwards. (Assigning clones
// here was the last per-frame allocation on this path; CPU readers of the frame fields copy the
// values out immediately, so nothing depends on the handles being fresh objects.)
const _scratch = new WeakMap();

function _scratchFor( block ) {

	let s = _scratch.get( block );
	if ( ! s ) _scratch.set( block, s = {
		view: new Matrix4(), proj: new Matrix4(), vp: new Matrix4(), vpj: new Matrix4(), invView: new Matrix4(),
		invProj: new Matrix4(), invViewProj: new Matrix4(), prevVP: new Matrix4(),
		cameraPos: new Vector3(), prevCameraPos: new Vector3(),
		resolution: new Vector2(), invResolution: new Vector2(), jitter: new Vector2(), prevJitter: new Vector2(),
	} );
	return s;

}

// Write the camera state for a draw. `jitter` in pixels (internal resolution).
export function setFrameCamera( camera, width, height, { jitterX = 0, jitterY = 0, prevViewProj = null, prevCameraPos = null, block = FrameUniforms } = {} ) {

	const F = block.fields;
	const s = _scratchFor( block );
	camera.updateMatrixWorld();
	if ( camera.matrixWorldInverse ) camera.matrixWorldInverse.copy( camera.matrixWorld ).invert();
	s.view.copy( camera.matrixWorldInverse );
	s.proj.copy( camera.projectionMatrix );
	F.view.value = s.view;
	F.proj.value = s.proj;
	const vp = s.vp.multiplyMatrices( s.proj, s.view );
	F.viewProjNoJitter.value = vp;
	// jitter: translate clip xy by 2 * px / size (times w, so a pre-multiplied translation)
	const jx = 2 * jitterX / width, jy = 2 * jitterY / height;
	_m.makeTranslation( jx, jy, 0 );
	const vpj = s.vpj.multiplyMatrices( _m, vp );
	F.viewProj.value = vpj;
	F.invView.value = s.invView.copy( camera.matrixWorld );
	F.invProj.value = s.invProj.copy( s.proj ).invert();
	F.invViewProj.value = s.invViewProj.copy( vpj ).invert();
	F.prevViewProjNoJitter.value = s.prevVP.copy( prevViewProj || vp );
	s.cameraPos.setFromMatrixPosition( camera.matrixWorld );
	F.cameraPos.value = s.cameraPos;
	F.prevCameraPos.value = s.prevCameraPos.copy( prevCameraPos || s.cameraPos );
	F.near.value = camera.near;
	F.far.value = camera.far;
	F.resolution.value = s.resolution.set( width, height );
	F.invResolution.value = s.invResolution.set( 1 / width, 1 / height );
	s.prevJitter.copy( s.jitter );
	F.prevJitter.value = s.prevJitter;
	F.jitter.value = s.jitter.set( jx, jy );
	F.reversedDepth.value = camera.reversedDepth === false ? 0 : 1;

}
