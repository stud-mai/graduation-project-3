let WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({ port: 9999 });

let connections = [];

wss.on('connection', (ws) => {

    // Рассылаем всем участникам информацию (о новом сообщение, новом/ушедшем участнике, изменении аватара)
    function notifyAll(msg){
        console.log('==========');
        connections.forEach((connection) => {
            console.log('sending data to client:');
            console.log(connection.user);
            connection.send(msg,(e) => {
                if (e) {
                    connections = connections.filter((current) => {
                        return current !== connection;
                    });
                    console.log('close connection');
                }
            });
        });
    }
    // Собираем информацию о том, кто есть в чате
    function getAllParticipants(type) {
        let participants = connections.map((connection) => { return connection.user });
        return {type: type, participants: participants};
    }

    console.log('==========');
    console.log('new connection');
    console.log('==========');

    ws.on('message', (message) => {
        console.log('==========');
        console.log('new message "%s"', message);

        // Парсим принятое сообщение
        // и определяем какие действия нужно прежпринять по его типу
        let parsedMsg = JSON.parse(message),
            type = parsedMsg.type;
        switch (type){
            // действия, связанные с авторизацией и изменением количества участников
            case 'auth':
                let existing = connections.filter((connection) => {
                    if (connection.user) {
                        return connection.user.nickname === parsedMsg.nickname
                    }
                });
                if (!existing.length) {
                    connections.push(ws);
                    ws.user = {
                        fullname: parsedMsg.fullname,
                        nickname: parsedMsg.nickname,
                        photo: parsedMsg.photo
                    };
                    ws.send(message);
                    notifyAll(JSON.stringify(getAllParticipants(type))); // нотификация об изменении участников
                } else {
                    let msg = 'Access denied. User with this nick already exists.';
                    ws.send(JSON.stringify({type: type, warning: msg}));
                }
                break;
            // все остальные действия (отправка сообщения или изменение аватара)
            default:
                notifyAll(message);
                break;
        }

        console.log('==========');
    });

    ws.on('close', () => {
        connections = connections.filter((current) => {
            return current !== ws;
        });
        // оповещаем всех участников о том, кто вышел из чата
        notifyAll(JSON.stringify(getAllParticipants('auth')));
        console.log('close connection');
    });
});