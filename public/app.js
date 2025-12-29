// Подключение к серверу Socket.IO
const socket = io();

// DOM элементы
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const currentUsernameEl = document.getElementById('current-username');
const usersListEl = document.getElementById('users-list');
const usersCountEl = document.getElementById('users-count');
const friendsListEl = document.getElementById('friends-list');
const friendsCountEl = document.getElementById('friends-count');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesEl = document.getElementById('messages');

// Кнопки звонков
const startCallBtn = document.getElementById('start-call-btn');
const startAudioBtn = document.getElementById('start-audio-btn');
const endCallBtn = document.getElementById('end-call-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');

// Видео элементы
const videoSection = document.getElementById('video-section');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// Модальное окно
const incomingCallModal = document.getElementById('incoming-call-modal');
const callerNameEl = document.getElementById('caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

// Переменные
let currentUsername = '';
let localStream = null;
let peerConnection = null;
let remoteSocketId = null;
let isVideoEnabled = true;
let isAudioEnabled = true;
let friendsList = new Set(); // Список друзей текущего пользователя

// Конфигурация WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// === ВХОД В ПРИЛОЖЕНИЕ ===
joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

function joinChat() {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        currentUsernameEl.textContent = `👤 ${username}`;
        socket.emit('register', username);
        
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
let onlineUsers = new Map(); // socketId -> username

socket.on('users-update', (usersData) => {
    usersCountEl.textContent = usersData.length;
    usersListEl.innerHTML = '';
    
    // Обновляем карту пользователей
    onlineUsers.clear();
    usersData.forEach(userData => {
        if (userData.username !== currentUsername) {
            onlineUsers.set(userData.socketId, userData.username);
            
            const userDiv = createUserItem(userData, false);
            usersListEl.appendChild(userDiv);
        }
    });
    
    // Если нет других пользователей, отключаем кнопки
    if (usersData.length <= 1) {
        startCallBtn.disabled = true;
        startAudioBtn.disabled = true;
    }

    // Обновляем список друзей онлайн
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
    
    // Показываем только друзей, которые сейчас онлайн
    friendsList.forEach(friendName => {
        // Проверяем, онлайн ли друг
        const friendData = Array.from(onlineUsers.entries())
            .find(([, name]) => name === friendName);
        
        if (friendData) {
            onlineFriendsCount++;
            const [socketId, username] = friendData;
            const userDiv = createUserItem({ socketId, username }, true);
            friendsListEl.appendChild(userDiv);
        }
    });
    
    friendsCountEl.textContent = onlineFriendsCount;
    
    if (onlineFriendsCount === 0) {
        friendsListEl.innerHTML = '<div style="padding: 10px; color: #999; font-size: 0.9em;">Нет друзей онлайн</div>';
    }
}

function createUserItem(userData, isFriend) {
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    if (isFriend) {
        userDiv.classList.add('friend');
    }
    userDiv.dataset.socketId = userData.socketId;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = userData.username;
    
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
    
    userDiv.appendChild(nameSpan);
    userDiv.appendChild(friendBtn);
    
    // Обработчик клика для выбора пользователя для звонка
    nameSpan.addEventListener('click', () => {
        // Убираем выделение со всех
        document.querySelectorAll('.user-item').forEach(u => u.classList.remove('selected'));
        // Выделяем выбранного
        userDiv.classList.add('selected');
        remoteSocketId = userData.socketId;
        
        // Активируем кнопки звонков
        startCallBtn.disabled = false;
        startAudioBtn.disabled = false;
    });
    
    return userDiv;
}

// === ВИДЕОЗВОНКИ (WebRTC) ===

// Инициация видеозвонка
startCallBtn.addEventListener('click', () => startCall(true));
startAudioBtn.addEventListener('click', () => startCall(false));

async function startCall(withVideo) {
    if (!remoteSocketId) {
        alert('Пожалуйста, выберите пользователя из списка для звонка');
        return;
    }
    
    try {
        // Получаем локальный поток (видео и/или аудио)
        localStream = await navigator.mediaDevices.getUserMedia({
            video: withVideo,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        videoSection.classList.remove('hidden');
        
        // Создаем WebRTC соединение
        createPeerConnection();
        
        // Добавляем треки в соединение
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Отправляем offer выбранному пользователю
        socket.emit('call-user', {
            offer: offer,
            to: remoteSocketId
        });
        
        toggleVideoBtn.style.display = withVideo ? 'inline-block' : 'none';
        
    } catch (error) {
        console.error('Ошибка доступа к медиа:', error);
        alert('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.');
    }
}

// Получение входящего звонка
socket.on('call-made', async (data) => {
    remoteSocketId = data.from;
    callerNameEl.textContent = `${data.username} звонит вам...`;
    incomingCallModal.classList.remove('hidden');
    
    // Сохраняем offer для последующего использования
    window.incomingOffer = data.offer;
});

// Принять звонок
acceptCallBtn.addEventListener('click', async () => {
    incomingCallModal.classList.add('hidden');
    
    try {
        // Получаем локальный поток
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        localVideo.srcObject = localStream;
        videoSection.classList.remove('hidden');
        
        // Создаем соединение
        createPeerConnection();
        
        // Добавляем треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Устанавливаем удаленное описание
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
        
        // Создаем answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Отправляем answer
        socket.emit('make-answer', {
            answer: answer,
            to: remoteSocketId
        });
        
    } catch (error) {
        console.error('Ошибка при принятии звонка:', error);
        alert('Не удалось принять звонок. Проверьте разрешения на камеру/микрофон.');
    }
});

// Отклонить звонок
rejectCallBtn.addEventListener('click', () => {
    incomingCallModal.classList.add('hidden');
    socket.emit('end-call', { to: remoteSocketId });
});

// Получение answer
socket.on('answer-made', async (data) => {
    remoteSocketId = data.from;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

// Получение ICE кандидата
socket.on('ice-candidate', async (data) => {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Ошибка добавления ICE кандидата:', error);
    }
});

// Создание WebRTC соединения
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    
    // Отправка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && remoteSocketId) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: remoteSocketId
            });
        }
    };
    
    // Получение удаленного потока
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };
    
    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
        console.log('Состояние соединения:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed') {
            endCall();
        }
    };
}

// Управление видео
toggleVideoBtn.addEventListener('click', () => {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks()[0].enabled = isVideoEnabled;
    toggleVideoBtn.textContent = isVideoEnabled ? '📹' : '📹❌';
});

// Управление аудио
toggleAudioBtn.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks()[0].enabled = isAudioEnabled;
    toggleAudioBtn.textContent = isAudioEnabled ? '🎤' : '🎤❌';
});

// Завершение звонка
endCallBtn.addEventListener('click', () => {
    socket.emit('end-call', { to: remoteSocketId });
    endCall();
});

socket.on('call-ended', () => {
    endCall();
});

function endCall() {
    // Останавливаем все треки
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Закрываем соединение
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Очищаем видео элементы
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Скрываем видео секцию
    videoSection.classList.add('hidden');
    
    // Сбрасываем состояние
    remoteSocketId = null;
    isVideoEnabled = true;
    isAudioEnabled = true;
    toggleVideoBtn.textContent = '📹';
    toggleAudioBtn.textContent = '🎤';
}

// Обработка отключения
window.addEventListener('beforeunload', () => {
    endCall();
});

