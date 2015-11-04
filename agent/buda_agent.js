// Buda Agent
// ==========
// Base template of a buda agent; should be extended on
// specific implementations.
//
// function CustomAgent( conf ) {
//   BudaAgent.call( this, conf );
//
//   this.parser = .....
// }
// util.inherits( CustomAgent, BudaAgent );

// Enable strict syntax mode
'use strict';

// Load required modules
var _ = require( 'underscore' );
var net = require( 'net' );
var util = require( 'util' );
var zlib = require( 'zlib' );
var mongoose = require( 'mongoose' );
var events = require( 'events' );

// Constructor
// Configuration parameters expected should match the 'zone.data' attribute
// according to the supported zone schema version
function BudaAgent( conf ) {
  // Process each data packet received
  this.parser = null;

  // Readable stream opened against the agent's endpoint
  this.incoming = null;

  // Location to listen for incoming data packets
  this.endpoint = conf.hotspot.location;

  // Configuration parameters
  this.config = conf;
  if( ! _.has( this.config, 'compression' ) ) {
    this.config.compression = 'none';
  }

  // Add a data decompressor if required
  switch( this.config.compression ) {
    case 'gzip':
      this.decrompressor = zlib.createGunzip();
      break;
    case 'none':
    default:
      this.config.compression = 'none';
      this.decrompressor = null;
  }

  // Configure schema and base data model for storage
  this.storageSchema = new mongoose.Schema({});
  this.storageSchema.set( 'strict', false );
  this.storageSchema.set( 'collection', this.config.storage.collection );
  this.model = mongoose.model( 'Doc', this.storageSchema );

  // Listen for interruptions
  process.stdin.resume();
  process.on( 'SIGINT', _.bind( this.exit, this ) );
  process.on( 'SIGTERM', _.bind( this.exit, this ) );
}

// Add event emitter capabilities
util.inherits( BudaAgent, events.EventEmitter );

// Start listening for data on the endpoint
// For tests you can run:
// cat datafile | nc localhost PORT
// cat datafile | nc -U file.sock
BudaAgent.prototype.start = function() {
  // Check a valid parser is set
  if( ! this.parser ) {
    throw new Error( 'No parser set for the agent' );
  }

  // Connect to data storage
  this.connectStorage();

  // Create server
  this.incoming = net.createServer( _.bind( function( socket ) {
    if( this.config.compression !== 'none' ) {
      socket
        .pipe( this.decrompressor, { end: false })
        .pipe( this.parser, { end: false });
    } else {
      socket.pipe( this.parser, { end: false });
    }
  }, this ) );

  // Start listening for data
  this.incoming.listen( this.endpoint, _.bind( function() {
    this.log( 'Agent ready' );
  }, this ) );
};

// Gracefull shutdown process
BudaAgent.prototype.exit = function() {
  // Close incoming connections
  if( this.incoming ) {
    this.incoming.close();
  }

  // Close DB connection
  mongoose.disconnect();

  // Custom cleanup process
  this.cleanup();

  // Exit entirely
  /* eslint no-process-exit:0 */
  process.exit();
};

// Cleanup procedure
// Just logging message by default, could be implemented based on
// the custom agent specific requirements
BudaAgent.prototype.cleanup = function() {
  return;
};

// Data transform procedure
// Just logging message by default, could be implemented based on
// the custom agent specific requirements
BudaAgent.prototype.transform = function( record ) {
  return record;
};

// Stablish a connection with the used data storage
BudaAgent.prototype.connectStorage = function() {
  var storage = null;

  // Connect to DB
  // The storage host will be collected from ENV and override as config parameter
  if( process.env.STORAGE_PORT ) {
    storage = process.env.STORAGE_PORT.replace( 'tcp://', '' );
  }
  if( this.config.storage.host ) {
    storage = this.config.storage.host;
  }

  // No storage located? exit with error
  if( ! storage ) {
    throw new Error( 'No storage available' );
  }

  // Append selected DB and connect
  storage += '/' + this.config.storage.db;
  mongoose.connect( 'mongodb://' + storage );
  return;
};

// Logs are sent directly to stdout as JSON message; if a string is used
// as parameter a minimal wrap object is used for it, time is automatically
// added to all messages
/* eslint no-param-reassign:0 */
BudaAgent.prototype.log = function( msg ) {
  if( _.isObject( msg ) ) {
    msg = JSON.stringify( msg );
  }
  process.stdout.write( msg );
};

module.exports = BudaAgent;
