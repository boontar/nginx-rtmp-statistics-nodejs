var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require("fs");
var configuration = JSON.parse(
    fs.readFileSync("config.json")
);
const bearerToken = require('express-bearer-token');
var http = require('http');
var app = express();

var router = express.Router();

var edge = [], streams = [];

//Some logic made by me to handle the arrays

Array.prototype.inArray = function (element, comparer) {
    for (var i = 0; i < this.length; i++) {
        if (comparer(this[i])) {
            this.splice(i, 1, element);
            return true;
        }
    }
    return false;
};

Array.prototype.pushIfNotExist = function (element, comparer) {
    if (!this.inArray(element, comparer)) {
        this.unshift(element);
    }
};

Array.prototype.max = function () {
    return Math.max.apply(null, this);
};

Array.prototype.min = function () {
    return Math.min.apply(null, this);
};

//App sets

var port = normalizePort(process.env.PORT || configuration.port);
app.set('port', port);

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bearerToken());
app.use('/', router);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

//Socket initialization / Network

var server = http.createServer(app);
var io = require('socket.io')(server);
server.listen(port);

io.on('connection', function (socket) {
    socket.on('sendserver', function (packet) {
        if (packet.security.key === configuration.key) {
            packet.edge.timestamp = Date.now();
            console.log(packet.edge);
            edge.pushIfNotExist(packet.edge, function (e) {
                return e.ip === packet.edge.ip; //check if the server already exists in the array!
            });
            socket.emit('serverUpdated', {updated: 'OK'});
        } else {
            socket.emit('serverUpdated', {updated: 'FAIL -> Security Key Invalid'});
        }
    });
    socket.on('sendstreams', function (packet) {
        if (packet.security.key === configuration.key) {
            packet.streams.timestamp = Date.now();
            console.log(packet.streams);
            streams.pushIfNotExist(packet.streams, function (e) {
                return e.ip === packet.streams.ip; 
            });
            socket.emit('streamsUpdated', {updated: 'OK'});
        } else {
            socket.emit('streamsUpdated', {updated: 'FAIL -> Security Key Invalid'});
        }
    });
});

//Define routes here
function check_token (req, res) {
    if(configuration.accessToken != req.token) {
        res.status(200).json([{"status": "error"}]);
    }
}

router.get('/streams', function (req, res, next) {
    check_token(req, res);
    var obj = streams;

    for (var i = 0; i < obj.length; i++) {
        obj[i].last_update = new Date(obj[i].timestamp);
        if(obj[i].streams) {
            obj[i].status = "FOUND";
        } else {
            obj[i].status = "NOT_FOUND";
        }
    }

    res.status(200).json(obj);
});

router.get('/stream/:id', function (req, res, next) {
    check_token(req, res);
    var text, status = "NOT_FOUND", obj = streams, serverName = 'undefined', info, last_update, timestamp;
    if(streams) {
        for (var k = 0; k < obj.length; k++) {    
            if(obj[k].streams) {
                obj[k].streams.map(function(l,i){
                    if(l.name == req.params.id) {
                        info = l;
                        status = "FOUND";
                        serverName = obj[k].ip;
                    }
                })
            }
            timestamp = obj[k].timestamp;
            last_update = new Date(obj[k].timestamp);
            text = [{
                "timestamp": timestamp,
                "last_update": last_update,
                "status": "NOT_FOUND"
            }];
        }
        if(status == "FOUND") {
            text = [{
                "ip": serverName,
                "timestamp": timestamp,
                "last_update": last_update,
                "stream": info,
                "status": status
            }];
        }
    }
    res.status(200).json(text);
});

router.get('/servers', function (req, res, next) {
    check_token(req, res);
    var obj = edge;

    for (var i = 0; i < obj.length; i++) {
        if ((Date.now() - obj[i].timestamp) <= configuration.timeout) { //if a server is more than 5 seconds without updating gets flagged as OFFLINE!
            obj[i].status = 'ONLINE';
        } else {
            obj[i].status = 'OFFLINE';
        }

        obj[i].last_update = new Date(obj[i].timestamp);
    }

    res.status(200).json(obj);
});

router.get('/freeserver', function (req, res, next) {
    check_token(req, res);
    var freeServer;
    var minimum = 0;

    minimum = parseInt(edge[0].clients, 10);

    for (var i = 0; i < edge.length; i++) {
        var clients = parseInt(edge[i].clients, 10);

        if (clients <= minimum) {
            minimum = clients;
            freeServer = edge[i];
        }
    }

    res.status(200).json({
        ip: freeServer.ip
    });
});

module.exports = app;