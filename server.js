const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Служим статические файлы
app.use(express.static('public'));

// Хранилище подключенных пользователей
const users = new Map(); // socketId -> username
// Хранилище друзей (сохраняется в памяти, при перезапуске сбросится)
const friends = new Map(); // username -> Set of friend usernames

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Регистрация пользователя
    socket.on('register', (username) => {
        users.set(socket.id, username);
        console.log(`${username} присоединился`);
        
        // Отправляем список пользователей всем (с socketId)
        const usersList = Array.from(users.entries()).map(([socketId, username]) => ({
            socketId,
            username
        }));
        io.emit('users-update', usersList);
    });

    // Обработка текстовых сообщений
    socket.on('chat-message', (data) => {
        const username = users.get(socket.id) || 'Аноним';
        io.emit('chat-message', {
            username: username,
            message: data.message,
            timestamp: new Date().toLocaleTimeString('ru-RU')
        });
    });

    // WebRTC сигналинг для видеозвонков
    socket.on('call-user', (data) => {
        io.to(data.to).emit('call-made', {
            offer: data.offer,
            from: socket.id,
            username: users.get(socket.id)
        });
    });

    socket.on('make-answer', (data) => {
        io.to(data.to).emit('answer-made', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    socket.on('end-call', (data) => {
        if (data.to) {
            io.to(data.to).emit('call-ended');
        }
    });

    // Добавление в друзья
    socket.on('add-friend', (friendUsername) => {
        const username = users.get(socket.id);
        if (!username) return;

        // Инициализируем списки друзей, если их нет
        if (!friends.has(username)) {
            friends.set(username, new Set());
        }
        if (!friends.has(friendUsername)) {
            friends.set(friendUsername, new Set());
        }

        // Добавляем в оба списка (двусторонняя дружба)
        friends.get(username).add(friendUsername);
        friends.get(friendUsername).add(username);

        console.log(`${username} и ${friendUsername} теперь друзья`);

        // Отправляем обновленные списки друзей обоим
        socket.emit('friends-update', Array.from(friends.get(username) || []));
        
        // Находим socketId друга и отправляем ему обновление
        const friendSocketId = Array.from(users.entries())
            .find(([, name]) => name === friendUsername)?.[0];
        if (friendSocketId) {
            io.to(friendSocketId).emit('friends-update', Array.from(friends.get(friendUsername) || []));
        }
    });

    // Удаление из друзей
    socket.on('remove-friend', (friendUsername) => {
        const username = users.get(socket.id);
        if (!username) return;

        if (friends.has(username)) {
            friends.get(username).delete(friendUsername);
        }
        if (friends.has(friendUsername)) {
            friends.get(friendUsername).delete(username);
        }

        console.log(`${username} и ${friendUsername} больше не друзья`);

        // Отправляем обновленные списки
        socket.emit('friends-update', Array.from(friends.get(username) || []));
        
        const friendSocketId = Array.from(users.entries())
            .find(([, name]) => name === friendUsername)?.[0];
        if (friendSocketId) {
            io.to(friendSocketId).emit('friends-update', Array.from(friends.get(friendUsername) || []));
        }
    });

    // Получение списка друзей при подключении
    socket.on('get-friends', () => {
        const username = users.get(socket.id);
        if (!username) return;
        
        socket.emit('friends-update', Array.from(friends.get(username) || []));
    });

    // Отключение пользователя
    socket.on('disconnect', () => {
        const username = users.get(socket.id);
        users.delete(socket.id);
        console.log(`${username || 'Пользователь'} отключился`);
        
        // Обновляем список пользователей
        const usersList = Array.from(users.entries()).map(([socketId, username]) => ({
            socketId,
            username
        }));
        io.emit('users-update', usersList);
    });
});

http.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Откройте браузер и перейдите по адресу`);
});

