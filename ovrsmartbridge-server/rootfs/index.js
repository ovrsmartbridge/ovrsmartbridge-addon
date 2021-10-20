const WebSocket = require('ws');
const axios = require('axios');


const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN;

const port = 17825;

console.log('setup entities - setting initial off state on startup');
updateEntityState('binary_sensor.ovrsmartbridge_hmd_proximity_sensor', 'off', "moving", "OVRSB HMD Proximity Sensor");

const wss = new WebSocket.Server({ port: port });

let ha_gateway_ws = null;
let ha_gateway_connection_tries = 0;

setInterval(() => {
    
    if (ha_gateway_ws != null) {
        return;
    }

    ha_gateway_connection_tries ++;
    if (ha_gateway_connection_tries > 30)
    {
        console.error(`maximum ha_gateway_connection_tries reached, stopping addon...`);
        process.exit(1);
    }
    console.log(`connecting ha_gateway_ws (try #${ha_gateway_connection_tries})`);

    try {
        ha_gateway_ws = new WebSocket("ws://supervisor/core/websocket");
    } catch (e) {
        ha_gateway_ws = null;
        console.log(`connection failed (${e.message})`)
        return;
    }

    ha_gateway_ws.on("error", err => {
        ha_gateway_ws = null;
        console.log(`connection failed (${err})`)
        return;
    });

    ha_gateway_ws.on('close', () => {
        console.log('ha_gateway_ws connection closed');
        ha_gateway_ws = null;
    });
    
    ha_gateway_ws.on('message', (message) => {
        ha_gateway_connection_tries = 0;
        console.log('ha_gateway_ws: received message: ' + message);
        const data = JSON.parse(message);

        switch (data.type) {
            case 'auth_required':
                ha_gateway_ws.send(JSON.stringify({
                    type: "auth",
                    access_token: SUPERVISOR_TOKEN
                }));
                break;

            case 'auth_ok':
                console.log('authentication with homeassistant ok');
                console.log('subscribing to event "ovrsmartbridge_notify" (18)');
                ha_gateway_ws.send(JSON.stringify({
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

                switch (data.event.event_type) {
                    case 'ovrsmartbridge_notify':
                        let notify_message = data.event.data.message;
                        console.log('Will forward message to HMD: ' + notify_message);
                        wss.clients.forEach(function each(client) {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: "notify",
                                    message: notify_message
                                }));
                            }
                        });
                        break;

                    case 'ha_started':
                        console.log('ha_started event detected');
                        break;

                    default:
                        console.warn('unknown event type');

                }
        }
    });

}, 10000);


// console.log(`Supervisor Token is ${SUPERVISOR_TOKEN}`);

console.log(`WebSocket server started on port ${port}`);

function updateEntityState(entity, state, device_class, friendly_name)
{
    console.log(`Setting entity (${entity}) (${friendly_name}) to state (${state}) and device_class (${device_class})`);
    axios.post('http://supervisor/core/api/states/' + entity, {
        state: state,
        attributes: {
            device_class: device_class,
            friendly_name: friendly_name
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
}

function noop() { }

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', function connection(ws, req) {

    const ip = req.socket.remoteAddress;
    console.log(`New connection from ${ip}`);
    console.log(`Firing event "ovrsmartbridge_client_connected"`);
    axios.post('http://supervisor/core/api/events/ovrsmartbridge_client_connected', {
        // 
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

    ws.on('message', function incoming(message) {
        console.log('received message: %s', message);

        // console.log(message.toString());

        const message_json = JSON.parse(message);

        if (message_json.type == "evrevent" && message_json.context == "proximity_sensor")
        {
            updateEntityState('binary_sensor.ovrsmartbridge_hmd_proximity_sensor', message_json.state, "moving", "OVRSB HMD Proximity Sensor");
        }

    });

    ws.on('close', (data) => {
        console.log(`Connection lost ${ip}`);
        console.log(`Firing event "ovrsmartbridge_client_disconnected"`);
        axios.post('http://supervisor/core/api/events/ovrsmartbridge_client_disconnected', {
            // 
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