// Tiny collector for Bench reference shots: POST /<name>.bgra saves the body to outDir.
// Usage: node tools/bench-collector.mjs [outDir] [port]
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve( process.argv[ 2 ] || '/tmp/tidewater-shots' );
const port = Number( process.argv[ 3 ] || 5190 );
mkdirSync( outDir, { recursive: true } );

createServer( ( req, res ) => {

	res.setHeader( 'Access-Control-Allow-Origin', '*' );
	if ( req.method === 'OPTIONS' ) {

		res.setHeader( 'Access-Control-Allow-Methods', 'POST, OPTIONS' );
		res.end();
		return;

	}
	const chunks = [];
	req.on( 'data', ( c ) => chunks.push( c ) );
	req.on( 'end', () => {

		const name = decodeURIComponent( req.url ).replace( /^\/+/, '' ).replace( /[^A-Za-z0-9._-]/g, '_' );
		if ( name && chunks.length ) {

			writeFileSync( join( outDir, name ), Buffer.concat( chunks ) );
			console.log( 'saved', name, chunks.reduce( ( a, c ) => a + c.length, 0 ), 'bytes' );

		}
		res.end( 'ok' );

	} );

} ).listen( port, '127.0.0.1', () => console.log( 'collector on http://127.0.0.1:' + port, '->', outDir ) );
