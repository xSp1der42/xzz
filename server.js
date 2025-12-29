const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Служим статические файлы
app.use(express.static('public'));

// Хранилище подключенных пользователей
const users = new Map(); // socketId -> {username, avatar}
// Хранилище друзей
const friends = new Map(); // username -> Set of friend usernames

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);

    // Регистрация пользователя
    socket.on('register', (data) => {
        users.set(socket.id, {
            username: data.username,
            avatar: data.avatar || '😀'
        });
        console.log(`${data.username} (${data.avatar}) присоединился`);
        
        // Отправляем список пользователей всем
        const usersList = Array.from(users.entries()).map(([socketId, userData]) => ({
            socketId,
            username: userData.username,
            avatar: userData.avatar
        }));
        io.emit('users-update', usersList);
    });

    // Обработка текстовых сообщений
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

    // === ДЕМОНСТРАЦИЯ ЭКРАНА ===
    
    // Начало демонстрации экрана
    socket.on('screen-share', (data) => {
        const userData = users.get(socket.id);
        if (!userData) return;
        
        console.log(`${userData.username} начал демонстрацию для ${data.to}`);
        
        io.to(data.to).emit('screen-share-incoming', {
            offer: data.offer,
            from: socket.id,
            username: userData.username,
            avatar: userData.avatar
        });
    });

    // Answer на демонстрацию
    socket.on('screen-share-answer', (data) => {
        console.log('Answer получен, отправляем обратно');
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

    // ICE кандидаты
    socket.on('ice-candidate', (data) => {
        if (data.to) {
            io.to(data.to).emit('ice-candidate', {
                candidate: data.candidate,
                from: socket.id
            });
        }
    });

    // === СИСТЕМА ДРУЗЕЙ ===
    
    // Добавление в друзья
    socket.on('add-friend', (friendUsername) => {
        const userData = users.get(socket.id);
        if (!userData) return;

        const username = userData.username;

        // Инициализируем списки друзей
        if (!friends.has(username)) {
            friends.set(username, new Set());
        }
        if (!friends.has(friendUsername)) {
            friends.set(friendUsername, new Set());
        }

        // Добавляем в оба списка
        friends.get(username).add(friendUsername);
        friends.get(friendUsername).add(username);

        console.log(`${username} и ${friendUsername} теперь друзья`);

        // Отправляем обновленные списки
        socket.emit('friends-update', Array.from(friends.get(username) || []));
        
        const friendSocketId = Array.from(users.entries())
            .find(([, data]) => data.username === friendUsername)?.[0];
        if (friendSocketId) {
            io.to(friendSocketId).emit('friends-update', Array.from(friends.get(friendUsername) || []));
        }
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

    // Отключение пользователя
    socket.on('disconnect', () => {
        const userData = users.get(socket.id);
        if (userData) {
            console.log(`${userData.username} отключился`);
        }
        users.delete(socket.id);
        
        // Обновляем список пользователей
        const usersList = Array.from(users.entries()).map(([socketId, userData]) => ({
            socketId,
            username: userData.username,
            avatar: userData.avatar
        }));
        io.emit('users-update', usersList);
    });
});

http.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Откройте браузер и перейдите по адресу`);
});
