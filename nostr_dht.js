/* Nostr DHT Library
* MIT License 2024 - Jachen Duschletta
* Define wrapper for nostr protocol to send and subscribe to data
*/

/* Dependencies */
import {schnorr} from '@noble/curves/secp256k1'

/* Globals */
const relays = [
    'relay.nostr.net',
    'relay.snort.social',
    'relay.piazza.today',
    'relay.exit.pub',
    'nostr.lu.ke',
    'nostr.mom',
    'relay.urbanzap.space',
    'nostr.data.haus',
    'nostr.sathoarder.com',
    'relay.nostromo.social',
    'relay.nostr.bg',
    'nostr.stakey.net',
    'nostr.vulpem.com',
    'a.nos.lol',
    'eu.purplerelay.com',
    'nostr2.sanhauf.com',
    'e.nos.lol'
  ].map(url => 'wss://' + url)

const debug = false

/*
* Key Manager Module, contains functions for managing key and crypto related functions
*/

const keyManager = {}

/**
 * Generate a new public and private key Keypair
 * @returns {{publicKey: string, privateKey: string}} Schnorr Keypair
 */
keyManager.generateKeypair = function () {
    // generate key pair
    let privateKey = schnorr.utils.randomPrivateKey()
    let publicKey = schnorr.getPublicKey(privateKey).reduce((a, c) => a + c.toString(16).padStart(2, '0'), '')
    return {publicKey, privateKey}
}

/**
 * Sign a message with your private key
 * @param {string} messageHash - String messageHash to sign
 * @param {object} keyPair - expects a Schnorr Keypair 
 * @returns {{message: string, signature: string}} signed message
 */
keyManager.signMessage = function (messageHash, keyPair) {
    let signature = schnorr.sign(messageHash, keyPair.privateKey)
    signature = utils.bufferToHex(signature)
    return signature
}

/**
 * Generate Message hash from content
 * @param {{kind: number, content: string, pubkey: string, created_at: number}} content 
 * @returns {string} message hash
 */
keyManager.generateMessageHash = async function (content) {
    let serializedContent = JSON.stringify([
        0,
        content.pubkey,
        content.created_at,
        content.kind,
        content.tags,
        content.content
    ])
    let encoder = new TextEncoder()
    let serializedContentBytes = encoder.encode(serializedContent, 'utf-8')
    let hashed = await crypto.subtle.digest('SHA-256', serializedContentBytes)
    let bufferOfHash = new Uint8Array(hashed)
    return utils.bufferToHex(bufferOfHash)
}

/*
* Event Manager Module, contains functions for managing events and subscriptions
*/

/* Default Event from https://github.com/nostr-protocol/nips/blob/master/01.md

{
  "id": <32-bytes lowercase hex-encoded sha256 of the serialized event data>,
  "pubkey": <32-bytes lowercase hex-encoded public key of the event creator>,
  "created_at": <unix timestamp in seconds>,
  "kind": <integer between 0 and 65535>,
  "tags": [
    [<arbitrary string>...],
    // ...
  ],
  "content": <arbitrary string>,
  "sig": <64-bytes lowercase hex of the signature of the sha256 hash of the serialized event data, which is the same as the "id" field>
}
  */
const eventManager = {}

eventManager.generateSendEvent = async function (message, tag, topic) {
    // Events are ["EVENT", <event JSON>]
    let eventContent = {
        kind:29333,
        content: message,
        pubkey: connectionManager.keyPair.publicKey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [[tag, topic]]
    }

    let id = await keyManager.generateMessageHash(eventContent)
    console.log("Generated Hash:", id)
    let signature = await keyManager.signMessage(id, connectionManager.keyPair)
    let eventMessage = JSON.stringify([
        'EVENT',
        {
            ...eventContent,
            id,
            sig: signature
        }
    ]) 
    return eventMessage
}

eventManager.generateRequestAndSubscribeEvent = async function (tag, topic, subscriptionId) {
    /* Requests are ["REQ", <subscription_id>, <filters1>, <filters2>, ...] format */
    let eventContent = {
        kinds: [29333],
        since: Math.floor(Date.now() / 1000) - (10), // 10 seconds ago
        ['#' + tag]: [topic]       
    }

    return JSON.stringify([
        'REQ',
        subscriptionId,
        eventContent
    ])

}

eventManager.generateUnsubscribeEvent = async function (tag, topic) {
    // Unsubscribes are ["CLOSE", <subscription_id>]
}

/* utilities */

const utils = {}

utils.bufferToHex = function (buffer) {
    return buffer.reduce((a, c) => a + c.toString(16).padStart(2, '0'), '')
}

utils.generateRandomId = function (n) {
    let charSet = '0123456789AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'
    let randomId = Array(n).fill()
    for (let i = 0; i < randomId.length; i++) {
        randomId[i] = charSet[Math.floor(Math.random() * charSet.length)]
    }
    console.log("Generated Random ID:", randomId.join(''))
    return randomId.join('')
}

/*
* Connection Manager
*/
const connectionManager = {}

connectionManager.connectionInterval = null
connectionManager.connections = []
connectionManager.handlers = new Map()
connectionManager.sockets = {}

connectionManager.connect = async function (relays, keyPair) {
    if (!connectionManager.relays) {
        connectionManager.relays = relays
    }

    if (!connectionManager.keyPair) {
        connectionManager.keyPair = keyPair
    }

    if (!connectionManager.connectionInterval) {
        connectionManager.connectionInterval = setInterval(connectionManager.connectAndMaintain, 500)
    }

    return new Promise((resolve, _) => {
        function checkConnections(resolve) {
            if (connectionManager.connections.length >= 5) {
                resolve(true)
            } else {
                setTimeout(() => checkConnections(resolve), 2000)
            }
        }

        if (connectionManager.connections.length >= 5) {
            return checkConnections(resolve)
        } else {
            setTimeout(() => checkConnections(resolve), 2000)
        }
    })
}

connectionManager.connectAndMaintain = async function () {
    // take first relay in array
    let relay = connectionManager.relays.shift()
    if (debug) console.log('Connecting or Maintaining relay link:', relay, connectionManager?.sockets[relay]?.readyState)
    // check socket connection state
    if (connectionManager?.sockets[relay] && connectionManager.sockets[relay].readyState === 1) {
        // push relay back to array
        connectionManager.relays.push(relay)
    } else {
        // create new socket
        let socket = new WebSocket(relay)
        
        socket.onclose = () => {
            connectionManager.connections = connectionManager.connections.filter(c => c.url !== relay)
            delete connectionManager.sockets[relay]
        }

        socket.onerror = (err) => {
            console.error('Error connecting to relay:', relay, err)
        }

        socket.onmessage = (msg) => { 
            /* TODO: Handle additional Messages from relay*/
            /*
                ["EVENT", <subscription_id>, <event JSON as defined above>], used to send events requested by clients.
                ["OK", <event_id>, <true|false>, <message>], used to indicate acceptance or denial of an EVENT message.
                ["EOSE", <subscription_id>], used to indicate the end of stored events and the beginning of events newly received in real-time.
                ["CLOSED", <subscription_id>, <message>], used to indicate that a subscription was ended on the server side.
                ["NOTICE", <message>], used to send human-readable error messages or other things to clients.
            */
            if (debug) console.log('Received message:', msg)
            let data = JSON.parse(msg.data)
            connectionManager.passToHandlers(data)
        }
        
        socket.onopen = () => {
            if (debug) console.log('Connection to relay established', relay)
            connectionManager.connections.push({url: relay, socket: socket})
        }

        connectionManager.sockets[relay] = socket
        connectionManager.relays.push(relay)
    }
}

connectionManager.broadcast = function (data) {
    connectionManager.connections.forEach((c) => {
        if (c.socket && c.socket.readyState === 1) {
            if (debug) console.log('Relaying data to:', c.url, data)
            c.socket.send(data)
        } else {
            console.log('Connection not ready for relay:', c.url)
        }
    })
}

connectionManager.addHandler = function (subscriptionId, handler) {
    connectionManager.handlers.set(subscriptionId, handler)
}

connectionManager.passToHandlers = function (msg) {
    if (debug) console.log('Passing message', msg)
    connectionManager.handlers.forEach((handler, subId) => {
        if (msg[0] === 'EVENT' && msg[1] === subId) {
            handler(msg[2])
        }
    })
}

connectionManager.announceData = async function (message, tag, topic) {
    let data = await eventManager.generateSendEvent(message, tag, topic)
    console.log('About to announce data:', data)
    connectionManager.broadcast(data)
}

connectionManager.closeConnections = function () {
    clearInterval(connectionManager.connectionInterval)
    connectionManager.sockets.forEach(c => c.socket.close())
}

/* 
* Provide Interface Functions to expose 
*/

/**
 * Start connections to nostr relays
 * @returns {Promise<boolean>} true if we have at least 5 connections
 */
export async function startConnections() {
    // generate a new key pair
    let keyPair = keyManager.generateKeypair()
    // connect to all relays
    return await connectionManager.connect(relays, keyPair)
}

const announceInterval = 15 * 1000 * 60 // 15 minutes

/**
 * Announce data to the network (ephemeral)
 * Use this for service discovery
 * @param {string} message 
 * @param {string} tag 
 * @param {string} topic 
 */
export async function announceData(message, tag, topic) {
    connectionManager.announceData(message, tag, topic)
    return setInterval(connectionManager.announceData.bind(null, message, tag, topic), announceInterval)
}

const tagtopicToSubscriptionId = new Map()
const subscriptionIdTotagtopic = new Map()

/**
 * Subscribe to data for the corresponding tag and topic
 * @param {string} tag 
 * @param {string} topic
 * @param {function} responseHandler
 */
export async function subscribeToData(tag, topic, responseHandler) {
    let subscriptionId = utils.generateRandomId(64)
    tagtopicToSubscriptionId.set([tag,topic], subscriptionId)
    subscriptionIdTotagtopic.set(subscriptionId, [tag, topic])
    let data = await eventManager.generateRequestAndSubscribeEvent(tag, topic, subscriptionId)
    connectionManager.addHandler(subscriptionId, responseHandler)
    connectionManager.broadcast(data)
    return subscriptionId
}

/**
 * Unsubscribe from data for the corresponding tag and topic
 * @param {string} tag 
 * @param {string} topic 
 */
export async function unsubscribeFromData(tag, topic) {

}