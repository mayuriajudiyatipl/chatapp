

const socket = io();


document.addEventListener('DOMContentLoaded', () => {
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const messages = document.getElementById('messages');
  const usersList = document.getElementById('users');
  const usernameDisplay = document.getElementById('username');
  const clearChatLink = document.querySelector('a[href="/clearChat"]'); // Get the clear chat link

  // Request the session data from the server
  fetch('/session')
    .then(response => response.json())
    .then(data => {
      const username = data.username;
      if (!username) {
        window.location.href = '/'; // Redirect to login if no username is found
        return;
      }
      usernameDisplay.textContent = username; // Display username
      // Emit userJoin event with the username
      socket.emit('userJoin', { username });

      document.getElementById('clearChatLink').addEventListener('click', (event) => {
        event.preventDefault();
        socket.emit('clearChat');
      });


      // Listen for new messages
      messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value;
        socket.emit('sendMessage', message);
        messageInput.value = '';
      });

      socket.on('newMessage', (data) => {
        const messageElement = document.createElement('div');
        messageElement.innerHTML = `${data.username}: ${data.message}`;
        messages.appendChild(messageElement);
      });

      socket.on('updateUsers', (users) => {
        usersList.innerHTML = ''; // Clear the list before updating
        Object.keys(users).forEach((username) => {
          const userElement = document.createElement('li');
          userElement.textContent = username;

          // Highlight the active user (the user currently logged in)
          if (username === data.username) {
            userElement.style.fontWeight = 'bold';
            userElement.style.color = 'blue'; // Optional: Style the active user differently
          }

          usersList.appendChild(userElement);
        });
      });

      socket.on('chatHistory', (messages) => {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = ''; // Clear current messages
        messages.forEach(({ username, message }) => {
          const messageElement = document.createElement('div');
          messageElement.textContent = `${username}: ${message}`;
          messagesContainer.appendChild(messageElement);
        });
      });

      socket.on('clearChat', (data) => {
        messages.innerHTML = ''; // Clear existing messages
        const clearChatMessage = document.createElement('div');
        clearChatMessage.textContent = data.message; // Display the clear chat message
        messages.appendChild(clearChatMessage);
      });
    })
    .catch(err => {
      console.error('Error fetching session data:', err);
      window.location.href = '/'; // Redirect to login if there's an error with the session data
    });
});
