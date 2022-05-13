import expat from 'node-expat';
import fs from 'fs';
import events from 'events';
import util from 'util';
import zlib from 'zlib';

function etXmlReader(filename, recordRegEx, options) {
	const self = this;

	options = options || [];
	options.gzip = options.gzip || false;

	const parser = new expat.Parser('UTF-8');
	let stream = typeof filename === "string" ? fs.createReadStream(filename) : filename;

	if (options.gzip) {
		const gunzip = zlib.createGunzip();
		stream.pipe(gunzip);
		stream = gunzip;
	}

	stream.on('data', function (data) {
		parser.parse(data);
		self.emit('data', data);
	});

	stream.on('end', () => {
		self.emit('endParse', {});
	});

	///////////////////////////

	let node = {};
	let nodes = [];
	let record;
	let isCapturing = false;
	let level = 0;

	parser.on('startElement', function (name, attrs) {
		level++;

		if (!isCapturing && !name.match(recordRegEx)) {
			return;
		} else if (!isCapturing) {
			isCapturing = true;
			node = {};
			nodes = [];
			record = undefined;
		}

		if (node.children === undefined) {
			node.children = {};
		}

		let child = {};
		if (node.children[name] === undefined) {
			node.children[name] = child;
		} else {
			if (Array.isArray(node.children[name])) {
				node.children[name].push(child);
			} else {
				node.children[name] = [node.children[name], child];
			}
		}

		if (Object.keys(attrs).length > 0) {
			child.attrs = attrs;
		}

		nodes.push(node);
		node = child;

		if (name.match(recordRegEx)) {
			record = node;
		}
	});

	parser.on('text', function (txt) {
		if (!isCapturing) {
			return;
		}

		if (txt.length > 0) {
			if (node.text === undefined) {
				node.text = txt;
			} else {
				node.text += txt;
			}
		}
	});

	parser.on('endElement', function (name) {
		level--;
		node = nodes.pop();

		if (name.match(recordRegEx)) {
			isCapturing = false;
			self.emit('record', record);
		}

		if (level === 0) {
			self.emit('end');
		}

	});

	// pause stream
	self.pause = function () {
		stream.pause();
		this._suspended = true;
		if (!parser.pause()) {
			throw(new Error("Cannot pause parser: " + parser.getError()));
		}
	};

	// resume stream
	self.resume = function () {
		this._suspended = false;

		if (!parser.resume()) {
			throw(new Error("Cannot resume parser: " + parser.getError()));
		}

		// resume stream only if parser hasn't been paused again
		if (!this._suspended) {
			stream.resume();
		}
	};

	// end parse
	self.endParsePromise = function () {
		return new Promise((resolve, reject) => {
			try {
				self.on('endParse', function () {
					resolve(true);
				})
			} catch (parseError) {
				reject(false);
			}
		});
	}
}

util.inherits(etXmlReader, events.EventEmitter);

export {etXmlReader};