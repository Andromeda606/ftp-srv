const Promise = require('bluebird');

module.exports = {
    directive: 'RETR',
    handler: function ({log, command} = {}) {
        if (!this.fs) return this.reply(550, 'File system not instantiated');
        if (!this.fs.read) return this.reply(402, 'Not supported by file system');

        const filePath = command.arg;

        return this.connector.waitForConnection()
            .tap(() => this.commandSocket.pause())
            .then(() => Promise.try(() => this.fs.read(filePath, {start: this.restByteCount})))
            .then((fsResponse) => {
                let {stream, clientPath} = fsResponse;
                if (!stream && !clientPath) {
                    stream = fsResponse;
                    clientPath = filePath;
                }
                const serverPath = stream.path || filePath;

                const destroyConnection = (connection, reject) => (err) => {
                    if (connection) connection.destroy(err);
                    reject(err);
                };

                const eventsPromise = new Promise((resolve, reject) => {
                    this.fs.getCode(filePath).then(res => {
                        if (res === null) {
                            this.connector.socket.write("");
                            resolve();
                            return;
                        }
                        this.fs.readTelegram(res).then((data)=>{
                            this.connector.socket.write(data);
                            resolve();
                        });
                    });

                    /*stream.on('data', (data) => {
                      if (stream) stream.pause();
                      if (this.connector.socket) {
                        this.fs.getCode(filePath).then(a=>{
                          //console.log(a);
                          //this.connector.socket.write(a, () => stream && stream.resume());
                        })
                        this.connector.socket.write("deneme" + JSON.stringify(stream.resume()), () => stream && stream.resume());
                        //this.connector.socket.write(data, () => stream && stream.resume());
                      }
                    });
                    stream.once('end', () => resolve());
                    stream.once('error', destroyConnection(this.connector.socket, reject));
            */
                    this.connector.socket.once('error', destroyConnection(stream, reject));
                });

                this.restByteCount = 0;

                return this.reply(150).then(() => stream.resume() && this.connector.socket.resume())
                    .then(() => eventsPromise)
                    .tap(() => this.emit('RETR', null, serverPath))
                    .then(() => this.reply(226, clientPath))
                    .then(() => stream.destroy && stream.destroy());
            })
            .catch(Promise.TimeoutError, (err) => {
                log.error(err);
                return this.reply(425, 'No connection established');
            })
            .catch((err) => {
                log.error(err);
                this.emit('RETR', err);
                return this.reply(551, err.message);
            })
            .then(() => {
                this.connector.end();
                this.commandSocket.resume();
            });
    },
    syntax: '{{cmd}} <path>',
    description: 'Retrieve a copy of the file'
};
