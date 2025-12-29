const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Служим статические файлы
app.use(express.static('public'));

// Хранилище профилей пользователей
const profiles = new Map(); // username -> {username, avatar, status, bio, createdAt}
// Хранилище подключенных пользователей
const users = new Map(); // socketId -> {username, avatar}
// Хранилище друзей
const friends = new Map(); // username -> Set of friend usernames
// Хранилище запросов в друзья
const friendRequests = new Map(); // username -> Set of {from, timestamp}
// Хранилище приватных сообщений
const privateMessages = new Map(); // "user1:user2" -> [messages]

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Регистрация/вход пользователя
    socket.on('register', (data) => {
        const username = data.username;
        
        // Создаём профиль, если не существует
        if (!profiles.has(username)) {
            profiles.set(username, {
                username: username,
                avatar: data.avatar || '😀',
                status: 'Привет! Я использую Milena 💜',
                bio: '',
                createdAt: new Date().toISOString()
            });
        } else {
            // Обновляем аватарку, если профиль существует
            const profile = profiles.get(username);
            profile.avatar = data.avatar || profile.avatar;
        }

        users.set(socket.id, {
            username: username,
            avatar: data.avatar || profiles.get(username).avatar
        });

        console.log(`${username} (${data.avatar}) присоединился`);
        
        // Отправляем профиль пользователю
        socket.emit('profile-data', profiles.get(username));
        
        // Отправляем список пользователей всем
        broadcastUsersList();

        // Отправляем запросы в друзья
        const requests = Array.from(friendRequests.get(username) || []);
        socket.emit('friend-requests-update', requests);
    });

    // Получение профиля пользователя
    socket.on('get-profile', (data) => {
        const profile = profiles.get(data.username);
        if (profile) {
            // Проверяем, друзья ли они
            const userData = users.get(socket.id);
            if (!userData) return;
            
            const isFriend = friends.has(userData.username) && 
                           friends.get(userData.username).has(data.username);
            
            socket.emit('profile-data', { ...profile, isFriend });
        }
    });

    // Обновление профиля
    socket.on('update-profile', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const profile = profiles.get(userData.username);
        if (profile) {
            if (data.avatar !== undefined) profile.avatar = data.avatar;
            if (data.status !== undefined) profile.status = data.status;
            if (data.bio !== undefined) profile.bio = data.bio;
            
            // Обновляем аватарку в текущей сессии
            if (data.avatar) {
                userData.avatar = data.avatar;
            }

            socket.emit('profile-updated', profile);
            broadcastUsersList();
        }
    });

    // Обработка текстовых сообщений (общий чат)
    socket.on('chat-message', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;
        
        io.emit('chat-message', {
            username: userData.username,
            avatar: userData.avatar,
            message: data.message,
            timestamp: new Date().toLocaleTimeString('ru-RU')
        });
    });

    // === ЛИЧНЫЕ ЧАТЫ ===

    // Отправка приватного сообщения
    socket.on('private-message', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const messageData = {
            from: userData.username,
            to: data.to,
            avatar: userData.avatar,
            message: data.message,
            timestamp: new Date().toLocaleTimeString('ru-RU')
        };

        // Сохраняем сообщение
        const chatKey = [userData.username, data.to].sort().join(':');
        if (!privateMessages.has(chatKey)) {
            privateMessages.set(chatKey, []);
        }
        privateMessages.get(chatKey).push(messageData);

        // Отправляем сообщение получателю
        const recipientSocketId = Array.from(users.entries())
            .find(([, user]) => user.username === data.to)?.[0];
        
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', messageData);
            // Отправляем уведомление о новом сообщении
            io.to(recipientSocketId).emit('notification', {
                type: 'message',
                from: userData.username,
                text: `Новое сообщение от ${userData.username}`
            });
        }

        // Отправляем обратно отправителю
        socket.emit('private-message', messageData);
    });

    // Получение истории личного чата
    socket.on('get-private-messages', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const chatKey = [userData.username, data.username].sort().join(':');
        const messages = privateMessages.get(chatKey) || [];
        socket.emit('private-messages-history', { username: data.username, messages });
    });

    // === ГОЛОСОВОЙ ЧАТ ===
    
    // Начало голосового звонка
    socket.on('voice-call', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;
        
        console.log(`${userData.username} звонит ${data.to}`);
        
        const recipientSocketId = Array.from(users.entries())
            .find(([, user]) => user.username === data.to)?.[0];
        
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('voice-call-incoming', {
                offer: data.offer,
                from: socket.id,
                username: userData.username,
                avatar: userData.avatar,
                hasVideo: data.hasVideo || false
            });
        }
    });

    // Answer на голосовой звонок
    socket.on('voice-call-answer', (data) => {
        console.log('Voice call answer получен');
        io.to(data.to).emit('voice-call-answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    // Завершение голосового звонка
    socket.on('end-voice-call', (data) => {
        console.log('Завершение голосового звонка');
        if (data.to) {
            io.to(data.to).emit('voice-call-ended');
        }
    });

    // Отклонение голосового звонка
    socket.on('voice-call-rejected', (data) => {
        if (data.to) {
            io.to(data.to).emit('voice-call-ended');
        }
    });

    // === ДЕМОНСТРАЦИЯ ЭКРАНА ===
    
    // Начало демонстрации экрана
    socket.on('screen-share', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;
        
        console.log(`${userData.username} начал демонстрацию для ${data.to}`);
        
        const recipientSocketId = Array.from(users.entries())
            .find(([, user]) => user.username === data.to)?.[0];
        
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('screen-share-incoming', {
                offer: data.offer,
                from: socket.id,
                username: userData.username,
                avatar: userData.avatar
            });
        }
    });

    // Answer на демонстрацию
    socket.on('screen-share-answer', (data) => {
        console.log('Screen share answer получен');
        io.to(data.to).emit('screen-share-answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    // Остановка демонстрации
    socket.on('stop-screen-share', (data) => {
        console.log('Остановка демонстрации');
        if (data.to) {
            io.to(data.to).emit('screen-share-stopped');
        }
    });

    // Отклонение демонстрации
    socket.on('screen-share-rejected', (data) => {
        if (data.to) {
            io.to(data.to).emit('screen-share-stopped');
        }
    });

    // ICE кандидаты (для всех WebRTC соединений)
    socket.on('ice-candidate', (data) => {
        if (data.to) {
            io.to(data.to).emit('ice-candidate', {
                candidate: data.candidate,
                from: socket.id
            });
        }
    });

    // === СИСТЕМА ДРУЗЕЙ ===
    
    // Отправка запроса в друзья
    socket.on('send-friend-request', (toUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const fromUsername = userData.username;

        // Проверяем, не друзья ли уже
        if (friends.has(fromUsername) && friends.get(fromUsername).has(toUsername)) {
            socket.emit('error', { message: 'Вы уже друзья' });
            return;
        }

        // Проверяем, нет ли уже запроса
        if (!friendRequests.has(toUsername)) {
            friendRequests.set(toUsername, new Set());
        }

        const existingRequest = Array.from(friendRequests.get(toUsername))
            .find(req => req.from === fromUsername);
        
        if (existingRequest) {
            socket.emit('error', { message: 'Запрос уже отправлен' });
            return;
        }

        // Добавляем запрос
        friendRequests.get(toUsername).add({
            from: fromUsername,
            timestamp: new Date().toISOString()
        });

        console.log(`${fromUsername} отправил запрос в друзья ${toUsername}`);

        // Уведомляем получателя
        const recipientSocketId = Array.from(users.entries())
            .find(([, data]) => data.username === toUsername)?.[0];
        
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('friend-requests-update', 
                Array.from(friendRequests.get(toUsername)));
            io.to(recipientSocketId).emit('notification', {
                type: 'friend-request',
                from: fromUsername,
                text: `${fromUsername} хочет добавить вас в друзья`
            });
        }

        socket.emit('friend-request-sent', { to: toUsername });
    });

    // Принятие запроса в друзья
    socket.on('accept-friend-request', (fromUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const username = userData.username;

        // Удаляем запрос
        if (friendRequests.has(username)) {
            const requests = friendRequests.get(username);
            const filtered = Array.from(requests).filter(req => req.from !== fromUsername);
            friendRequests.set(username, new Set(filtered));
        }

        // Добавляем в друзья
        if (!friends.has(username)) {
            friends.set(username, new Set());
        }
        if (!friends.has(fromUsername)) {
            friends.set(fromUsername, new Set());
        }

        friends.get(username).add(fromUsername);
        friends.get(fromUsername).add(username);

        console.log(`${username} и ${fromUsername} теперь друзья`);

        // Отправляем обновления
        socket.emit('friends-update', Array.from(friends.get(username) || []));
        socket.emit('friend-requests-update', Array.from(friendRequests.get(username) || []));
        
        const friendSocketId = Array.from(users.entries())
            .find(([, data]) => data.username === fromUsername)?.[0];
        
        if (friendSocketId) {
            io.to(friendSocketId).emit('friends-update', Array.from(friends.get(fromUsername) || []));
            io.to(friendSocketId).emit('notification', {
                type: 'friend-accepted',
                from: username,
                text: `${username} принял ваш запрос в друзья`
            });
        }
    });

    // Отклонение запроса в друзья
    socket.on('decline-friend-request', (fromUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const username = userData.username;

        if (friendRequests.has(username)) {
            const requests = friendRequests.get(username);
            const filtered = Array.from(requests).filter(req => req.from !== fromUsername);
            friendRequests.set(username, new Set(filtered));
        }

        socket.emit('friend-requests-update', Array.from(friendRequests.get(username) || []));
        console.log(`${username} отклонил запрос от ${fromUsername}`);
    });

    // Удаление из друзей
    socket.on('remove-friend', (friendUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const username = userData.username;

        if (friends.has(username)) {
            friends.get(username).delete(friendUsername);
        }
        if (friends.has(friendUsername)) {
            friends.get(friendUsername).delete(username);
        }

        console.log(`${username} и ${friendUsername} больше не друзья`);

        socket.emit('friends-update', Array.from(friends.get(username) || []));
        
        const friendSocketId = Array.from(users.entries())
            .find(([, data]) => data.username === friendUsername)?.[0];
        if (friendSocketId) {
            io.to(friendSocketId).emit('friends-update', Array.from(friends.get(friendUsername) || []));
        }
    });

    // Получение списка друзей
    socket.on('get-friends', () => {
        const userData = users.get(socket.id);
        if (!userData) return;
        
        socket.emit('friends-update', Array.from(friends.get(userData.username) || []));
    });

    // Отмена отправленного запроса
    socket.on('cancel-friend-request', (toUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        if (friendRequests.has(toUsername)) {
            const requests = friendRequests.get(toUsername);
            const filtered = Array.from(requests).filter(req => req.from !== userData.username);
            friendRequests.set(toUsername, new Set(filtered));

            const recipientSocketId = Array.from(users.entries())
                .find(([, data]) => data.username === toUsername)?.[0];
            
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('friend-requests-update', 
                    Array.from(friendRequests.get(toUsername)));
            }
        }
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        const userData = users.get(socket.id);
        if (userData) {
            console.log(`${userData.username} отключился`);
        }
        users.delete(socket.id);
        
        // Обновляем список пользователей
        broadcastUsersList();
    });

    // Функция для отправки списка пользователей всем
    function broadcastUsersList() {
        const usersList = Array.from(users.entries()).map(([socketId, userData]) => ({
            socketId,
            username: userData.username,
            avatar: userData.avatar
        }));
        io.emit('users-update', usersList);
    }
});

http.listen(PORT, () => {
    console.log(`🚀 Milena сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Откройте браузер и перейдите по адресу`);
});
