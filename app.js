'use strict';
const { createServer } = require('./server');
createServer().listen(process.env.PORT || 3000, () => {
  console.log('EinsatzPost is ready.');
});
