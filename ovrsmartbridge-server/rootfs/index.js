const WebSocket = require('ws');
const axios = require('axios');


const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

const port = 17825;
const wss = new WebSocket.Server({ port: port });

const ha_wsapi = new WebSocket("ws://supervisor/core/websocket");

ha_wsapi.on('message', (message) => {
    console.log('ha_wsapi: received message: ' + message);
    const data = JSON.parse(message);

    switch (data.type)
    {
        case 'auth_required':
            ha_wsapi.send(JSON.stringify({
                type: "auth",
                access_token: SUPERVISOR_TOKEN
            }));
            break;

        case 'auth_ok':
            ha_wsapi.send(JSON.stringify({
                id: 18,
                type: 'subscribe_events',
                event_type: 'ovrsmartbridge_notify'
            }));
            break;

        case 'auth_invalid':
            console.error('Could not authenticate to websocket api. Exiting.');
            process.exit(1)
            break;

        case 'event':
            const notify_message = data.event.data.message;
            console.log('Will forward message to HMD: ' + notify_message);
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(notify_message);
                }
            });
            break;
    }
});


// console.log(`Supervisor Token is ${SUPERVISOR_TOKEN}`);

console.log(`WebSocket server started on port ${port}`);

wss.on('connection', function connection(ws, req) {

    const ip = req.socket.remoteAddress;
    console.log(`New connection from ${ip}`);

    ws.on('message', function incoming(message) {
        console.log('received message: %s', message);

        // console.log(message.toString());

        axios.post('http://supervisor/core/api/states/' + 'binary_sensor.ovrsmartbridge_hmd_proximity_sensor', {
            state: message.toString(),
            attributes: {
                device_class: "moving",
                friendly_name: "OVRSB HMD Proximity Sensor"
            }
        }, {
            headers: {
                'Authorization': `Bearer ${SUPERVISOR_TOKEN}`,
                'Content-Type': 'application/json'
            }
        })
        .then((response) => {
            // console.log(response.data);
        }, (error) => {
            console.error(error);
        });

    });

    ws.on('disconnect', (data) => {
        console.log(`Connection lost ${port}`);
    });

});

function noop() { }

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();

        ws.isAlive = false;
        ws.ping(noop);
    });
}, 30000);

wss.on('close', function close() {
    clearInterval(interval);
});