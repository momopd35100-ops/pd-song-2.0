const express = require('express');
const path = require('path');

const app = express();
app.use(express.static(__dirname));

const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});