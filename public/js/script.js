const socket = io();

document.addEventListener('DOMContentLoaded', () => {
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');
  const messages = document.getElementById('messages');
  const usersList = document.getElementById('users');

  // Request the session data from the server
  fetch('/session')
    .then(response => response.json())
    .then(data => {
      const username = data.username;
      if (!username) {
        window.location.href = '/'; // Redirect to login if no username is found
        return;
      }

      // Emit userJoin event with the username
      socket.emit('userJoin', { username });

      // Listen for new messages
      messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value;
        socket.emit('sendMessage', message);
        messageInput.value = '';
      });

      socket.on('newMessage', (data) => {
        const messageElement = document.createElement('div');
        messageElement.textContent = `${data.username}: ${data.message}`;
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
    })
    .catch(err => {
      console.error('Error fetching session data:', err);
      window.location.href = '/'; // Redirect to login if there's an error with the session data
    });
});
