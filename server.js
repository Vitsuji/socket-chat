let express = require('express');
let app = express();
let server = require('http').createServer(app);
let io = require('socket.io').listen(server);
let url = require('url');


let users = [];
let connections = [];

// rooms which are currently available in chat
//let rooms = ['General','room2','room3'];
let rooms = {
    names: ['General', 'Room1', 'Room2'],
	numbers: [0, 0, 0],
	passwords: ['','',''],
	types: ['Public', 'Public', 'Public']
};

let current_room;

server.listen(process.env.PORT || 8080);
console.log('Listening on 8080');


app.use(function(req, res, next) {
	let fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
	let realurl = url.parse(fullUrl, true);
	
	let path = realurl.path;


	let countSlash = (path.match(/\//g) || []).length;

	if(countSlash == 1) {
		
		current_room =  path.replace('/','');
		if (rooms.names.indexOf(current_room) != -1 || current_room == ''){
			res.sendFile(__dirname + '/index.html');
		}else {
			res.sendFile(__dirname + '/404.html');
		}

		

		

	}else{
		res.sendFile(__dirname + '/illentry.html');
	}

});



io.sockets.on('connection', function (socket) {
	if(current_room == '') {
		socket.emit('init room', rooms.names[0]);
	}else{
		let pass = rooms.passwords[rooms.names.indexOf(current_room)];
		let passr;
		if(pass == ''){
			passr = 'Public';
			socket.emit('init room', current_room);
		}else {
			passr = 'Private';
			socket.emit('private init room', current_room);
		}
	}
	
	connections.push(socket);
	console.log(`Connected. ${connections.length} sockets connected.`);

	// when the client emits 'adduser', this listens and executes
	socket.on('new user', function(data, callback){
		let userdata = data.split(' ');
		if(userdata.length == 3) {
			let pass_ = rooms.passwords[rooms.names.indexOf(userdata[1])];
			if(pass_ == userdata[2]) {
				callback(true);
						// store the username in the socket session for this client
				socket.username = userdata[0];
				users.push(socket.username);
				// store the room name in the socket session for this client
				socket.room = userdata[1];
				socket.join(socket.room);
				// echo to client they've connected
				socket.emit('updatechat', 'SERVER', `you have connected to ${socket.room}`);
				// echo to room 1 that a person has connected to their room
				rooms.numbers[rooms.names.indexOf(socket.room)] +=1;
				socket.broadcast.to(`${socket.room}`).emit('updatechat', 'SERVER', `${socket.username} has connected to this room`);
				update_room_display(socket.room);
				io.sockets.emit('updaterooms', rooms.names, socket.room, rooms.numbers, rooms.types);
			}else{
				callback(false);
			}
		}else{
			callback(true);
					// store the username in the socket session for this client
			socket.username = userdata[0];
			users.push(socket.username);
			// store the room name in the socket session for this client
			socket.room = userdata[1];
			socket.join(socket.room);
			// echo to client they've connected
			socket.emit('updatechat', 'SERVER', `you have connected to ${socket.room}`);
			// echo to room 1 that a person has connected to their room
			rooms.numbers[rooms.names.indexOf(socket.room)] +=1;
			socket.broadcast.to(`${socket.room}`).emit('updatechat', 'SERVER', `${socket.username} has connected to this room`);
			io.sockets.emit('updaterooms', rooms.names, socket.room, rooms.numbers, rooms.types);

		}
		update_room_display(socket.room);
	});

	socket.on('add room', function(data, callback){

		
		let userdata = data.split(' ');
		
		rooms.names.push(userdata[0]);
		rooms.numbers.push(0);
		rooms.passwords.push(userdata[1]);

		if(userdata[1] == '') {
			rooms.types.push('Public');
		}else{
			rooms.types.push('Private');
		}

		callback(userdata[0]);
	});

	socket.on('unique room', function(data, callback){
		let if_exists = 0;
		rooms.names.forEach(function(item, index) {
			if(item == data){
				if_exists += 1;
			}
		});
		if(if_exists > 0) {
			callback(false);
		}else{
			callback(true);
		}
	});

	// when the client emits 'sendchat', this listens and executes
	socket.on('sendchat', function (data) {
		// we tell the client to execute 'updatechat' with 2 parameters
		io.sockets.in(socket.room).emit('updatechat', socket.username, data);
	});

	socket.on('switchRoom', function(newroom){

		// leave the current room (stored in session)
		socket.leave(socket.room);
		let oldroom = socket.room;
		// join new room, received as function parameter
		socket.join(newroom);
		socket.emit('updatechat', 'SERVER', `you have connected to ${newroom}`);
		// sent message to OLD room
		socket.broadcast.to(socket.room).emit('updatechat', 'SERVER', `${socket.username} has left this room`);
		// update socket session room title
		rooms.numbers[rooms.names.indexOf(socket.room)] -=1;
		socket.room = newroom; 
		rooms.numbers[rooms.names.indexOf(socket.room)] +=1;

		socket.broadcast.to(newroom).emit('updatechat', 'SERVER', `${socket.username} has joined this room`);

		console.log(`I switch from ${oldroom} to ${socket.room} knowing that ${rooms.names[0]} is indestructable`);
		if(rooms.numbers[rooms.names.indexOf(oldroom)] == 0 && oldroom != rooms.names[0]) {
			removeRoom(oldroom);
		}

		io.sockets.emit('updaterooms', rooms.names, socket.room, rooms.numbers, rooms.types);
		update_room_display(socket.room);
	
	});

	// when the user disconnects.. perform this
	socket.on('disconnect', function(){
		// remove the username from global users list
		users.splice(users.indexOf(socket.username), 1);
		console.log(`Disconnected. ${connections.length} sockets connected. `);
		// update list of users in chat, client-side
		io.sockets.emit('updateusers', users);

		// echo globally that this client has left
		socket.broadcast.emit('updatechat', 'SERVER',`${socket.username} has disconnected`);
		rooms.numbers[rooms.names.indexOf(socket.room)]-=1;
		
		let room = socket.room;
		socket.leave(socket.room);
		
		if(rooms.numbers[rooms.names.indexOf(room)] == 0 && room != rooms.names[0]) {
			removeRoom(room);
		}
		io.sockets.emit('updaterooms', rooms.names, socket.room, rooms.numbers, rooms.types);
	});

	function updateNumbers(room) {
		io.of('/').in(socket.room).clients(function(error,clients){
			let numClients=clients.length;
			return numClients;
		});		
	}

	function removeRoom(room) {
		console.log(rooms);
		let index = rooms.names.indexOf(room);
		console.log(`Index: ${index}`);

		rooms.names.splice(index, 1);
		rooms.numbers.splice(index, 1);
		rooms.passwords.splice(index,1);
		rooms.types.splice(index, 1);

		console.log(rooms);
	}

	function update_room_display (room) {
		socket.emit('update roomDisplay', room, rooms.numbers[rooms.names.indexOf(room)], rooms.types[rooms.names.indexOf(room)]);
	}

	setInterval(function(){
		update_room_display(socket.room)
   },10000);
});