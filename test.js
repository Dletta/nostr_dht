import * as nostr_dht from './nostr_dht.js'

function handler (resolve, message) {
    if (resolve) {
        resolve('received: ' + JSON.stringify(message))
    }
}   

async function mainTest () {
    let testMessage = 'This is a test message'

    await nostr_dht.startConnections()

    var subscriptionId = ''
    let result = new Promise(async (resolve) => {
        subscriptionId = await nostr_dht.subscribeToData('coordinates', handler.bind(null, resolve))
        console.log('Subscription ID:', subscriptionId)
    })

    console.log('Subscription ID:', subscriptionId)

    let broadcastInterval = await nostr_dht.announceData(testMessage, 'coordinates')

    await new Promise(resolve => setTimeout(resolve, 1000))

    return result
}

console.log('******************************')
console.log('* Nostr DHT Test            *')
console.log('* - Test subscribeToData    *')
console.log('* - Test announceData       *')
console.log('* Return data to confirm the transport works *')
console.log('******************************')
console.log('Running Test')
console.log('Test result:', await mainTest())




