// Подключение к серверу Socket.IO
const socket = io();

// DOM элементы
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const currentUsernameEl = document.getElementById('current-username');
const userAvatarEl = document.getElementById('user-avatar');
const previewAvatarEl = document.getElementById('preview-avatar');
const usersListEl = document.getElementById('users-list');
const usersCountEl = document.getElementById('users-count');
const friendsListEl = document.getElementById('friends-list');
const friendsCountEl = document.getElementById('friends-count');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesEl = document.getElementById('messages');

// Кнопки демонстрации экрана
const shareScreenBtn = document.getElementById('share-screen-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const screenSection = document.getElementById('screen-section');
const remoteScreen = document.getElementById('remote-screen');
const screenOwnerEl = document.getElementById('screen-owner');
const screenControlsEl = document.getElementById('screen-controls');

// Модальное окно
const incomingScreenModal = document.getElementById('incoming-screen-modal');
const screenCallerNameEl = document.getElementById('screen-caller-name');
const acceptScreenBtn = document.getElementById('accept-screen-btn');
const rejectScreenBtn = document.getElementById('reject-screen-btn');

// Переменные
let currentUsername = '';
let currentAvatar = '😀';
let localStream = null;
let peerConnection = null;
let remoteSocketId = null;
let isSharing = false;
let friendsList = new Set();

// Конфигурация WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// === ВЫБОР АВАТАРКИ ===
document.querySelectorAll('.avatar-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        currentAvatar = option.dataset.avatar;
        previewAvatarEl.textContent = currentAvatar;
    });
});

// Выбираем первую аватарку по умолчанию
document.querySelector('.avatar-option').classList.add('selected');

// === ВХОД В ПРИЛОЖЕНИЕ ===
joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

function joinChat() {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        currentUsernameEl.textContent = username;
        userAvatarEl.textContent = currentAvatar;
        
        socket.emit('register', { username, avatar: currentAvatar });
        
        loginScreen.classList.remove('active');
        mainScreen.classList.add('active');
        
        // Запрашиваем список друзей
        socket.emit('get-friends');
    }
}

// === ЧАТ ===
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chat-message', { message });
        messageInput.value = '';
    }
}

socket.on('chat-message', (data) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${data.avatar || '😀'}</span>
            <span class="message-username">${data.username}</span>
            <span class="message-time">${data.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(data.message)}</div>
    `;
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === СПИСОК ПОЛЬЗОВАТЕЛЕЙ ===
let onlineUsers = new Map();

socket.on('users-update', (usersData) => {
    usersCountEl.textContent = usersData.length;
    usersListEl.innerHTML = '';
    
    onlineUsers.clear();
    usersData.forEach(userData => {
        if (userData.username !== currentUsername) {
            onlineUsers.set(userData.socketId, userData);
            
            const userDiv = createUserItem(userData, false);
            usersListEl.appendChild(userDiv);
        }
    });
    
    // Обновляем кнопку демонстрации
    shareScreenBtn.disabled = usersData.length <= 1;
    
    // Обновляем список друзей
    updateFriendsList();
});

// === СПИСОК ДРУЗЕЙ ===
socket.on('friends-update', (friends) => {
    friendsList = new Set(friends);
    updateFriendsList();
});

function updateFriendsList() {
    friendsListEl.innerHTML = '';
    let onlineFriendsCount = 0;
    
    friendsList.forEach(friendName => {
        const friendData = Array.from(onlineUsers.values())
            .find(u => u.username === friendName);
        
        if (friendData) {
            onlineFriendsCount++;
            const userDiv = createUserItem(friendData, true);
            friendsListEl.appendChild(userDiv);
        }
    });
    
    friendsCountEl.textContent = onlineFriendsCount;
    
    if (onlineFriendsCount === 0) {
        friendsListEl.innerHTML = '<div class="no-friends">Нет друзей онлайн</div>';
    }
}

function createUserItem(userData, isFriend) {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item' + (isFriend ? ' friend' : '');
    userDiv.dataset.socketId = userData.socketId;
    
    const userInfo = document.createElement('div');
    userInfo.className = 'user-info-inline';
    userInfo.innerHTML = `
        <span class="user-avatar-small">${userData.avatar || '😀'}</span>
        <span class="user-name-text">${userData.username}</span>
    `;
    
    // Кнопка добавления/удаления из друзей
    const friendBtn = document.createElement('button');
    friendBtn.className = 'friend-btn';
    
    if (friendsList.has(userData.username)) {
        friendBtn.textContent = '✕';
        friendBtn.classList.add('remove');
        friendBtn.title = 'Удалить из друзей';
        friendBtn.onclick = (e) => {
            e.stopPropagation();
            socket.emit('remove-friend', userData.username);
        };
    } else {
        friendBtn.textContent = '+';
        friendBtn.title = 'Добавить в друзья';
        friendBtn.onclick = (e) => {
            e.stopPropagation();
            socket.emit('add-friend', userData.username);
        };
    }
    
    userDiv.appendChild(userInfo);
    userDiv.appendChild(friendBtn);
    
    // Клик для выбора пользователя для демонстрации
    userDiv.addEventListener('click', () => {
        document.querySelectorAll('.user-item').forEach(u => u.classList.remove('selected'));
        userDiv.classList.add('selected');
        remoteSocketId = userData.socketId;
        shareScreenBtn.disabled = false;
    });
    
    return userDiv;
}

// === ДЕМОНСТРАЦИЯ ЭКРАНА ===

// Начать демонстрацию экрана
shareScreenBtn.addEventListener('click', async () => {
    if (!remoteSocketId) {
        alert('Выберите пользователя из списка!');
        return;
    }
    
    try {
        console.log('Запуск демонстрации экрана...');
        
        // Захват экрана с максимальным качеством
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920, max: 1920 },
                height: { ideal: 1080, max: 1080 },
                frameRate: { ideal: 60, max: 60 },
                cursor: 'always'
            },
            audio: true
        });
        
        console.log('Экран захвачен!', localStream);
        
        isSharing = true;
        screenControlsEl.style.display = 'flex';
        
        // Создаем WebRTC соединение
        createPeerConnection();
        
        // Добавляем треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log('Трек добавлен:', track.kind);
        });
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log('Offer создан, отправляем...');
        
        // Отправляем offer
        socket.emit('screen-share', {
            offer: offer,
            to: remoteSocketId
        });
        
        // Отслеживаем остановку демонстрации
        localStream.getVideoTracks()[0].onended = () => {
            stopSharing();
        };
        
        console.log('Демонстрация началась!');
        
    } catch (error) {
        console.error('Ошибка демонстрации экрана:', error);
        alert('Не удалось начать демонстрацию экрана. Проверьте разрешения.');
        isSharing = false;
        screenControlsEl.style.display = 'none';
    }
});

// Остановить демонстрацию
stopShareBtn.addEventListener('click', () => {
    socket.emit('stop-screen-share', { to: remoteSocketId });
    stopSharing();
});

function stopSharing() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isSharing = false;
    screenControlsEl.style.display = 'none';
    remoteSocketId = null;
    
    // Сбрасываем выделение пользователей
    document.querySelectorAll('.user-item').forEach(u => u.classList.remove('selected'));
    
    console.log('Демонстрация остановлена');
}

// Получение входящей демонстрации
socket.on('screen-share-incoming', async (data) => {
    console.log('Входящая демонстрация от:', data.username);
    
    remoteSocketId = data.from;
    screenCallerNameEl.textContent = `${data.username} (${data.avatar || '😀'}) хочет показать экран`;
    incomingScreenModal.classList.remove('hidden');
    
    window.incomingOffer = data.offer;
});

// Принять демонстрацию
acceptScreenBtn.addEventListener('click', async () => {
    incomingScreenModal.classList.add('hidden');
    
    try {
        console.log('Принимаем демонстрацию...');
        
        // Показываем секцию экрана
        screenSection.classList.remove('hidden');
        const user = onlineUsers.get(remoteSocketId);
        screenOwnerEl.textContent = `${user?.avatar || '🖥️'} ${user?.username || 'Пользователь'} показывает экран`;
        
        // Создаем соединение
        createPeerConnection();
        
        // Устанавливаем удаленное описание
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
        
        // Создаем answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Answer создан, отправляем...');
        
        // Отправляем answer
        socket.emit('screen-share-answer', {
            answer: answer,
            to: remoteSocketId
        });
        
        console.log('Демонстрация принята!');
        
    } catch (error) {
        console.error('Ошибка при принятии демонстрации:', error);
        alert('Не удалось принять демонстрацию');
        screenSection.classList.add('hidden');
    }
});

// Отклонить демонстрацию
rejectScreenBtn.addEventListener('click', () => {
    incomingScreenModal.classList.add('hidden');
    socket.emit('screen-share-rejected', { to: remoteSocketId });
    remoteSocketId = null;
});

// Получение answer
socket.on('screen-share-answer', async (data) => {
    console.log('Получен answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Answer установлен!');
    } catch (error) {
        console.error('Ошибка установки answer:', error);
    }
});

// Получение ICE кандидата
socket.on('ice-candidate', async (data) => {
    try {
        if (peerConnection && data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            console.log('ICE кандидат добавлен');
        }
    } catch (error) {
        console.error('Ошибка добавления ICE кандидата:', error);
    }
});

// Остановка демонстрации
socket.on('screen-share-stopped', () => {
    console.log('Демонстрация остановлена удаленным пользователем');
    screenSection.classList.add('hidden');
    remoteScreen.srcObject = null;
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    remoteSocketId = null;
});

// Создание WebRTC соединения
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    console.log('PeerConnection создан');
    
    // Отправка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && remoteSocketId) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: remoteSocketId
            });
            console.log('ICE кандидат отправлен');
        }
    };
    
    // Получение удаленного потока
    peerConnection.ontrack = (event) => {
        console.log('Получен трек:', event.track.kind);
        if (event.streams && event.streams[0]) {
            remoteScreen.srcObject = event.streams[0];
            console.log('Видео поток установлен!');
        }
    };
    
    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
        console.log('Состояние соединения:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            if (isSharing) {
                stopSharing();
            } else {
                screenSection.classList.add('hidden');
                remoteScreen.srcObject = null;
            }
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE состояние:', peerConnection.iceConnectionState);
    };
}

// Обработка отключения
window.addEventListener('beforeunload', () => {
    if (isSharing) {
        stopSharing();
    }
});

console.log('Приложение загружено!');
