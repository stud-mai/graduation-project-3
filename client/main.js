let DOMLoaded = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => {
        resolve();
    });
});

DOMLoaded.then(() => {
    // как только загрузится дерево DOM отображаем форму авторизации
    document.getElementById('auth').style.display = 'block';
    return new Promise((resolve,reject) => {
        // устанавливаем соединение по websocket с сервером
        let ws = new WebSocket('ws://localhost:9999');
        ws.addEventListener('open',() => {resolve(ws)});
        ws.addEventListener('error',(error) => {reject(error)});
    }).then((ws) => {
        // после соединения добавляем прослушку собития клика на кнопке отправки запроса аторизации
        return new Promise((resolve) => {
            let authButton = document.getElementById('authButton');

            // прослушка входящего сообщения от сервера и его обработка
            // (только для типа сообщений 'auth', за исключением сообщений о новых/ушедших участниках)
            ws.addEventListener('message', (message) => {
                let msg = JSON.parse(message.data),
                    storage = localStorage[msg.nickname]; // история сообщений

                if (msg.type !== 'auth' || msg.participants) return;
                if (msg.warning) {
                    alert('Участник чата с таким ником уже существует. Выберете, пожалуйста, другой!');
                    return;
                }
                document.getElementById('auth').style.display = 'none';
                storage = storage? JSON.parse(storage) : {user: {}, chat: []};

                resolve([ws, msg, storage]);
            });

            // прослушка нажатия кнопки для отправки формы авторизации
            authButton.addEventListener('click', (e) => {
                let prevSibling = e.target.previousElementSibling,
                    nick = prevSibling.value,
                    fullname = prevSibling.previousElementSibling.value;

                e.preventDefault();
                if (fullname && nick) {
                    let authData = JSON.stringify({type: 'auth', fullname: fullname, nickname: nick, photo: ''});
                    ws.send(authData);
                } else {
                    alert('Заполните, пожалуйста, все поля!');
                }
            });
        })
    })
}).then((source) => {
    let ws = source[0], // websocket
        user = source[1], // данные пользователя
        messageHistory = source[2]; // загруженная из Local Storage история сообщений (если была такова, иначе {user: {}, chat: []})

    let chatMembers = document.querySelector("#chatMembers").innerHTML, // html разметка для Handlebars
        chatMessage = document.querySelector("#chatMessage").innerHTML, // html разметка для Handlebars
        templateMembers = Handlebars.compile(chatMembers), // компилирование шаблона Handlebars
        templateMessage = Handlebars.compile(chatMessage); // компилирование шаблона Handlebars

    let avatar = document.querySelector('.sidebar .avatar'), // фото пользователя вверху sidebar'а
        currentChatMembers = document.querySelector('#currentChatMembers'), // элемент для отображения участников чата
        photoUploadForm = document.querySelector('#photoUploadForm'), // форма для загрузки фото пользователя
        photoUpload = document.querySelector('#photoUpload'), // элемент для загрузки фото (открывает диалоговое меню)
        label = photoUpload.nextElementSibling, // элемент label для input
        chat = document.querySelector('.chat'), // область для сообщений
        welcome_fullname = document.querySelector('.sidebar .header > span'), // элемент, отображающий приветствие/имя пользователя
        resetButton = document.getElementById('resetButton'), // кнопка отмены загрузки фото
        sendPhotoButton = document.getElementById('sendPhotoButton'), // кнопка отправки выбранного фото
        sendMessageButton = document.getElementById('sendMessageButton'), // кнопка отправки сообщения
        messageField = document.getElementById('messageField'), // поле для ввода сообщения
        maxPhotoSize = 512, // максимальный размер загружаемой фотографии
        photoType = 'image/jpeg', // допустимый формат загружаемой фотографии
        photoChanged = false; // флаг он смене фотографии

    let fileReader = new FileReader();

    // функция отправки сообщения на сервер
    function sendMsgToServer(msg){
        ws.send(msg);
    }

    // функция определения последовательности действий в зависимости от типа пришедшего от сервера сообщения
    function onIncomingMessage(message){
        let msg = JSON.parse(message.data),
            type = msg.type;
        switch (type){
            case 'auth':
                let ul = document.createElement('ul');
                ul.innerHTML = templateMembers({list: msg.participants});
                currentChatMembers.innerHTML = 'Участники (' + msg.participants.length + '):' + ul.outerHTML;
                break;
            case 'text':
                renderChatMessages(msg);
                messageHistory.chat.push(msg);
                localStorage[user.nickname] = JSON.stringify(messageHistory);
                break;
            case 'photo':
                renderAvatar(msg);
                if (user.nickname === msg.user.nickname){
                    localStorage[user.nickname] = JSON.stringify(messageHistory);
                }
                break;
        }

    }

    // отображение фоторгафии пользователя как на sidebar'е, так и в сообщениях чата
    function renderAvatar(source){
        let userMessages = document.querySelectorAll(`li[data-nickname="${source.user.nickname}"]`);

        for (let userMessage of userMessages){
            userMessage.children[0].children[0].src = source.user.photo;
        }
        if (user.nickname === source.user.nickname){
            avatar.children[0].src = source.user.photo;
        }
    }

    // вывод новых/сохраненных сообщений чата
    function renderChatMessages(source){
        source = (source.length)? source : [source];
        chat.children[0].innerHTML += templateMessage({list: source});
        chat.scrollTop = chat.scrollHeight;
    }

    // проверка на валидность загружаемой фотографии
    function checkLoadedPhoto(file){
        let fsize = file.size / 1024,
            ftype = file.type;
        if (fsize > maxPhotoSize) {
            alert('Загружаемая фотография не должна быть больше 512 кбайт');
            return false;
        } else if (ftype != photoType) {
            alert('Загружаемая фотография должна быть в JPEG формате');
            return false;
        }
        return true;
    }

    // отправки сообщения в чате
    function sendTextMessage(e) {
        let msgInput = messageField.value;
        e.preventDefault();
        if (msgInput.trim()) {
            let today = new Date(),
                msg = {
                    type: 'text',
                    message: msgInput,
                    author: user,
                    time: today.toLocaleTimeString()
                };
            sendMsgToServer(JSON.stringify(msg));
            messageField.value ='';
        }
    }

    // изменение стиля отображения зоны, куда можно перетащить фотографию
    function resetStyleForDropzone(target) {
        if (target.tagName === 'IMG') {
            target.style.boxShadow = '';
        } else {
            target.style.backgroundColor = '';
            target.style.color = '#acacac';
        }
    }

    // если для данного пользователя была сохранена история сообщений
    // то выводим их, а также если есть фотографии самого пользователя
    if (messageHistory.user.nickname) {
        user.fullname = messageHistory.user.fullname;
        user.photo = messageHistory.user.photo;
        if (messageHistory.chat.length) renderChatMessages(messageHistory.chat);
        renderAvatar(messageHistory);
    // иначе передаем объект с данными пользователя в другой объект, неообходимый для сохранения будующей переписки
    } else {
        messageHistory.user = user;
    }

    welcome_fullname.innerText = user.fullname; // отображение имени пользователя на sidebar'е после удачной авторизации

    // прослушка события прихода входящих сообщений от сервера
    ws.addEventListener('message', onIncomingMessage);

    // прослушка нажатия на аватар в sidebar'е
    avatar.addEventListener('click', () => {
        let state = window.getComputedStyle(photoUploadForm).display;
        (state === 'none')? photoUploadForm.style.display = 'block' : photoUploadForm.style.display = 'none';
    });

    // чтение загруженной фотографии
    fileReader.addEventListener('load', () => {
        let [div, img] = photoUpload.nextElementSibling.children;

        div.style.display = 'none';
        img.style.display = 'block';

        // проверка на соответсвие новой загружаемой фотографии старой
        // если одинаковые, то действий никаких не совершаем
        if (user.photo === this.result){
            img.src = this.result;
            photoChanged = false;
        } else {
            img.src = user.photo = this.result;
            photoChanged = true;
        }
    });
    photoUpload.addEventListener('change', (e) => {
        let file = e.target.files[0];
        if (file){
            if (!checkLoadedPhoto(file)) return;
            fileReader.readAsDataURL(file);
        }
    });

    // из-за особенностей верстки отменяем действия по умолчанию:
    // - вызов диалогового окна для выбора фотографии
    // вместо этого вешаем его на зону drop zone по клику (247 строка)
    label.addEventListener('click',(e) => {e.preventDefault()});

    // прослушка клика по кнопке отмена на форме зарузки фотографии
    resetButton.addEventListener('click', (e) => {
        let [div, img] = photoUpload.nextElementSibling.children;

        e.preventDefault();
        div.style.display = 'block';
        img.style.display = 'none';
        img.src = user.photo = '';
    });
    // прослушка клика по кнопке загрузить на форме зарузки фотографии
    sendPhotoButton.addEventListener('click', (e) => {
        let temp = user.photo,
            msg = {
            type: 'photo',
            user: user
        };
        e.preventDefault();
        if (user.photo){
            if (photoChanged) sendMsgToServer(JSON.stringify(msg));
            photoUploadForm.style.display = 'none';
            resetButton.dispatchEvent(new MouseEvent('click'));
            user.photo = temp;
        } else {
            alert('Выберете/перетащите фотографию для загрузки!');
        }
    });

    // прослушка событий на целевой зоне (drop zone)
    // все события связаны с отображением на странице выбранной фотографии
    // и изменением стилей целевой зоны
    document.addEventListener('click',(e) => {
        let target = e.target;
        if (target.dataset.role === 'drop-zone'){
            label.previousElementSibling.click();
        }
    });
    document.addEventListener('dragleave', (e) => {
        let target = e.target;
        e.preventDefault();
        if (target.dataset.role === 'drop-zone') {
            resetStyleForDropzone(target);
        }
    });
    document.addEventListener('dragover', (e) => {
        let target = e.target;
        e.preventDefault();
        if (target.dataset.role === 'drop-zone') {
            if (target.tagName === 'IMG') {
                target.style.boxShadow = '0 0 3px 3px #ff7047';
            } else {
                target.style.backgroundColor = 'rgba(172,172,172,0.3)';
                target.style.color = '#868686';
            }
        }
    });
    document.addEventListener('drop', (e) => {
        let file = e.dataTransfer.files[0],
            target = e.target;
        e.preventDefault();
        if (target.dataset.role === 'drop-zone' && file) {
            if (!checkLoadedPhoto(file)) return;
            fileReader.readAsDataURL(file);
        }
        resetStyleForDropzone(target);
    });

    // прослушка нажатия кнопки отправки сообщения
    // либо клавиши "Enter" в текстовом поле сообщения
    sendMessageButton.addEventListener('click', sendTextMessage);
    messageField.addEventListener('change', sendTextMessage);

}).catch((error) => {
    alert('Произошла ошибка!');
    console.error(error);
});

