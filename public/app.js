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

// Кнопки звонков
const voiceCallBtn = document.getElementById('voice-call-btn');
const shareScreenBtn = document.getElementById('share-screen-btn');
const endCallBtn = document.getElementById('end-call-btn');

// Видео секция
const videoSection = document.getElementById('video-section');
const callStatus = document.getElementById('call-status');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');

// Чат
const chatTitle = document.getElementById('chat-title');
const backToGeneralBtn = document.getElementById('back-to-general-btn');

// Модальное окно
const incomingCallModal = document.getElementById('incoming-call-modal');
const callTypeTitle = document.getElementById('call-type-title');
const callCallerNameEl = document.getElementById('call-caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

// Переменные
let currentUsername = '';
let currentAvatar = '😀';
let localStream = null;
let peerConnection = null;
let remoteSocketId = null;
let remoteUsername = null;
let isInCall = false;
let currentCallType = null; // 'voice', 'screen'
let friendsList = new Set();
let currentChatUser = null; // null = общий чат

// Конфигурация WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun1.l.google.com:19302' },
        { urls: 'stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
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
    if (!message) return;
    
    if (currentChatUser) {
        // Отправляем приватное сообщение
        socket.emit('private-message', { 
            to: currentChatUser, 
            message 
        });
    } else {
        // Отправляем в общий чат
        socket.emit('chat-message', { message });
    }
    
    messageInput.value = '';
}

// Получение сообщений общего чата
socket.on('chat-message', (data) => {
    if (currentChatUser) return; // Не показываем, если в приватном чате
    
    displayMessage(data);
});

// Получение приватных сообщений
socket.on('private-message', (data) => {
    // Показываем только если это наш текущий чат
    if (currentChatUser === data.from || currentChatUser === data.to) {
        displayMessage(data, true);
    }
});

// Получение истории приватных сообщений
socket.on('private-messages-history', (data) => {
    messagesEl.innerHTML = '';
    data.messages.forEach(msg => displayMessage(msg, true));
});

function displayMessage(data, isPrivate = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message' + (isPrivate ? ' private' : '');
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${data.avatar || '😀'}</span>
            <span class="message-username">${data.from || data.username}</span>
            <span class="message-time">${data.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(data.message)}</div>
    `;
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Переключение в личный чат
function openPrivateChat(username) {
    currentChatUser = username;
    chatTitle.textContent = `💬 Чат с ${username}`;
    backToGeneralBtn.classList.remove('hidden');
    messagesEl.innerHTML = '';
    
    // Запрашиваем историю
    socket.emit('get-private-messages', { username });
}

// Возврат в общий чат
backToGeneralBtn.addEventListener('click', () => {
    currentChatUser = null;
    chatTitle.textContent = '💬 Общий чат';
    backToGeneralBtn.classList.add('hidden');
    messagesEl.innerHTML = '';
});

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
    
    // Обновляем кнопки
    const hasOtherUsers = usersData.length > 1;
    voiceCallBtn.disabled = !hasOtherUsers;
    shareScreenBtn.disabled = !hasOtherUsers;
    
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
    
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.display = 'flex';
    buttonsDiv.style.gap = '5px';
    
    // Кнопка личного чата
    const chatBtn = document.createElement('button');
    chatBtn.className = 'chat-btn';
    chatBtn.textContent = '💬';
    chatBtn.title = 'Личный чат';
    chatBtn.onclick = (e) => {
        e.stopPropagation();
        openPrivateChat(userData.username);
    };
    
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
    
    buttonsDiv.appendChild(chatBtn);
    buttonsDiv.appendChild(friendBtn);
    
    userDiv.appendChild(userInfo);
    userDiv.appendChild(buttonsDiv);
    
    // Клик для выбора пользователя для звонка
    userDiv.addEventListener('click', () => {
        if (isInCall) return;
        
        document.querySelectorAll('.user-item').forEach(u => u.classList.remove('selected'));
        userDiv.classList.add('selected');
        remoteSocketId = userData.socketId;
        remoteUsername = userData.username;
        voiceCallBtn.disabled = false;
        shareScreenBtn.disabled = false;
    });
    
    return userDiv;
}

// === ГОЛОСОВОЙ ЗВОНОК ===

voiceCallBtn.addEventListener('click', async () => {
    if (!remoteSocketId || !remoteUsername) {
        alert('Выберите пользователя из списка!');
        return;
    }
    
    try {
        console.log('Начинаем голосовой звонок...');
        
        // Захват аудио
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });
        
        console.log('Аудио захвачено!');
        
        isInCall = true;
        currentCallType = 'voice';
        
        // Показываем видео секцию (без видео, только для интерфейса)
        videoSection.classList.remove('hidden');
        callStatus.textContent = `🎤 Звонок ${remoteUsername}...`;
        localVideo.style.display = 'none'; // Скрываем локальное видео для голосового звонка
        
        // Создаем WebRTC соединение
        createPeerConnection();
        
        // Добавляем аудио треки
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
            console.log('Аудио трек добавлен');
        });
        
        // Создаем offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        console.log('Offer создан, отправляем...');
        
        // Отправляем offer
        socket.emit('voice-call', {
            offer: offer,
            to: remoteUsername,
            hasVideo: false
        });
        
        console.log('Голосовой звонок начался!');
        
    } catch (error) {
        console.error('Ошибка голосового звонка:', error);
        alert('Не удалось начать голосовой звонок. Проверьте разрешения на микрофон.');
        endCall();
    }
});

// === ДЕМОНСТРАЦИЯ ЭКРАНА ===

shareScreenBtn.addEventListener('click', async () => {
    if (!remoteSocketId || !remoteUsername) {
        alert('Выберите пользователя из списка!');
        return;
    }
    
    try {
        console.log('Запуск демонстрации экрана...');
        
        // Захват экрана с аудио
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
                cursor: 'always'
            },
            audio: true
        });
        
        console.log('Экран захвачен!');
        
        isInCall = true;
        currentCallType = 'screen';
        
        // Показываем видео секцию
        videoSection.classList.remove('hidden');
        callStatus.textContent = `🖥️ Демонстрация экрана для ${remoteUsername}`;
        localVideo.style.display = 'block';
        localVideo.srcObject = localStream;
        
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
            to: remoteUsername
        });
        
        // Отслеживаем остановку демонстрации
        localStream.getVideoTracks()[0].onended = () => {
            endCall();
        };
        
        console.log('Демонстрация началась!');
        
    } catch (error) {
        console.error('Ошибка демонстрации экрана:', error);
        alert('Не удалось начать демонстрацию экрана. Проверьте разрешения.');
        endCall();
    }
});

// === ЗАВЕРШЕНИЕ ЗВОНКА ===

endCallBtn.addEventListener('click', () => {
    if (currentCallType === 'screen') {
        socket.emit('stop-screen-share', { to: remoteSocketId });
    } else {
        socket.emit('end-voice-call', { to: remoteSocketId });
    }
    endCall();
});

function endCall() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isInCall = false;
    currentCallType = null;
    videoSection.classList.add('hidden');
    remoteVideo.srcObject = null;
    localVideo.srcObject = null;
    localVideo.style.display = 'block';
    
    // Сбрасываем выделение пользователей
    document.querySelectorAll('.user-item').forEach(u => u.classList.remove('selected'));
    
    console.log('Звонок завершён');
}

// === ВХОДЯЩИЕ ЗВОНКИ ===

// Входящий голосовой звонок
socket.on('voice-call-incoming', async (data) => {
    console.log('Входящий звонок от:', data.username);
    
    remoteSocketId = data.from;
    remoteUsername = data.username;
    callTypeTitle.textContent = data.hasVideo ? '📹 Входящий видеозвонок' : '🎤 Входящий звонок';
    callCallerNameEl.textContent = `${data.username} (${data.avatar || '😀'}) звонит вам`;
    incomingCallModal.classList.remove('hidden');
    
    window.incomingOffer = data.offer;
    window.incomingCallType = 'voice';
    window.incomingHasVideo = data.hasVideo;
});

// Входящая демонстрация экрана
socket.on('screen-share-incoming', async (data) => {
    console.log('Входящая демонстрация от:', data.username);
    
    remoteSocketId = data.from;
    remoteUsername = data.username;
    callTypeTitle.textContent = '🖥️ Входящая демонстрация экрана';
    callCallerNameEl.textContent = `${data.username} (${data.avatar || '😀'}) хочет показать экран`;
    incomingCallModal.classList.remove('hidden');
    
    window.incomingOffer = data.offer;
    window.incomingCallType = 'screen';
});

// Принять звонок
acceptCallBtn.addEventListener('click', async () => {
    incomingCallModal.classList.add('hidden');
    
    try {
        console.log('Принимаем звонок...');
        
        const callType = window.incomingCallType;
        
        if (callType === 'voice') {
            // Для голосового звонка захватываем только аудио
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            localVideo.style.display = 'none';
        } else {
            // Для демонстрации экрана аудио не нужно
            localStream = null;
            localVideo.style.display = 'none';
        }
        
        // Показываем секцию видео
        videoSection.classList.remove('hidden');
        callStatus.textContent = callType === 'voice' 
            ? `🎤 Звонок с ${remoteUsername}`
            : `🖥️ ${remoteUsername} показывает экран`;
        
        isInCall = true;
        currentCallType = callType;
        
        // Создаем соединение
        createPeerConnection();
        
        // Добавляем локальные треки (если есть)
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        // Устанавливаем удаленное описание
        await peerConnection.setRemoteDescription(new RTCSessionDescription(window.incomingOffer));
        
        // Создаем answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        console.log('Answer создан, отправляем...');
        
        // Отправляем answer
        if (callType === 'voice') {
            socket.emit('voice-call-answer', {
                answer: answer,
                to: remoteSocketId
            });
        } else {
            socket.emit('screen-share-answer', {
                answer: answer,
                to: remoteSocketId
            });
        }
        
        console.log('Звонок принят!');
        
    } catch (error) {
        console.error('Ошибка при принятии звонка:', error);
        alert('Не удалось принять звонок');
        endCall();
    }
});

// Отклонить звонок
rejectCallBtn.addEventListener('click', () => {
    incomingCallModal.classList.add('hidden');
    
    if (window.incomingCallType === 'voice') {
        socket.emit('voice-call-rejected', { to: remoteSocketId });
    } else {
        socket.emit('screen-share-rejected', { to: remoteSocketId });
    }
    
    remoteSocketId = null;
    remoteUsername = null;
});

// Получение answer
socket.on('voice-call-answer', async (data) => {
    console.log('Получен voice answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Answer установлен!');
        callStatus.textContent = `🎤 В звонке с ${remoteUsername}`;
    } catch (error) {
        console.error('Ошибка установки answer:', error);
    }
});

socket.on('screen-share-answer', async (data) => {
    console.log('Получен screen answer');
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Answer установлен!');
        callStatus.textContent = `🖥️ Демонстрация для ${remoteUsername}`;
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

// Завершение звонка
socket.on('voice-call-ended', () => {
    console.log('Звонок завершён удалённым пользователем');
    endCall();
});

socket.on('screen-share-stopped', () => {
    console.log('Демонстрация остановлена удалённым пользователем');
    endCall();
});

// === СОЗДАНИЕ WEBRTC СОЕДИНЕНИЯ ===

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
            if (event.track.kind === 'video') {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.style.display = 'block';
                console.log('Видео поток установлен!');
            } else if (event.track.kind === 'audio') {
                // Для аудио используем тот же элемент
                if (!remoteVideo.srcObject) {
                    remoteVideo.srcObject = event.streams[0];
                }
                console.log('Аудио поток установлен!');
            }
        }
    };
    
    // Обработка изменения состояния соединения
    peerConnection.onconnectionstatechange = () => {
        console.log('Состояние соединения:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'closed') {
            endCall();
        } else if (peerConnection.connectionState === 'connected') {
            console.log('Соединение установлено!');
            if (currentCallType === 'voice') {
                callStatus.textContent = `🎤 В звонке с ${remoteUsername}`;
            } else {
                callStatus.textContent = currentCallType === 'screen' && localStream
                    ? `🖥️ Демонстрация для ${remoteUsername}`
                    : `🖥️ ${remoteUsername} показывает экран`;
            }
        }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE состояние:', peerConnection.iceConnectionState);
    };
}

// Обработка отключения
window.addEventListener('beforeunload', () => {
    if (isInCall) {
        endCall();
    }
});

console.log('Milena загружена!');
