/**
 * ============================================
 * VulnLab Store - Servidor Principal
 * VULNERABLE BY DESIGN - DO NOT USE IN PRODUCTION
 * ============================================
 * 
 * Esta aplicação contém vulnerabilidades DELIBERADAS para fins educacionais.
 * Cada vulnerabilidade está marcada com comentários indicando o item correspondente.
 */

const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const serialize = require('node-serialize');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ============================================
// VULNERABILIDADE [Item 5]: JWT Secret hardcoded
// ============================================
const JWT_SECRET = 'secret123';

// ============================================
// VULNERABILIDADE [Item 20]: Hardcoded secrets expostos
// Estes "secrets" estão visíveis no código frontend também
// ============================================
const AWS_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';  // FAKE - Para demonstração
const AWS_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';  // FAKE

// Configuração do banco de dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://vulnuser:vulnpass123@localhost:5432/vulnlab'
});

// ============================================
// VULNERABILIDADE [Item 13]: CORS permissivo
// ============================================
app.use(cors({
    origin: '*',  // Permite qualquer origem
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ============================================
// VULNERABILIDADE [Item 14]: Upload irrestrito
// Permite qualquer extensão de arquivo
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Mantém a extensão original - PERIGOSO!
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Servir uploads publicamente (vulnerável)
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// ============================================
// VULNERABILIDADE [Item 22]: Log de senha
// ============================================
app.use((req, res, next) => {
    if (req.path === '/api/login' && req.method === 'POST') {
        console.log('[LOGIN ATTEMPT]', new Date().toISOString(), req.body);
        // ^^ Expõe senha nos logs do servidor!
    }
    next();
});

// ============================================
// MIDDLEWARE: Verificação de autenticação (vulnerável)
// ============================================
const authenticateToken = (req, res, next) => {
    // VULNERABILIDADE [Item 4]: Cookie sem flags de segurança
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        // VULNERABILIDADE [Item 5]: Aceita algoritmo "none"
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256', 'none'] });
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido' });
    }
};

// ============================================
// VULNERABILIDADE [Item 16]: Desserialização insegura
// ============================================
const parsePreferences = (req, res, next) => {
    const prefsCookie = req.cookies.preferences;
    if (prefsCookie) {
        try {
            // node-serialize é vulnerável a RCE!
            req.preferences = serialize.unserialize(Buffer.from(prefsCookie, 'base64').toString());
        } catch (e) {
            req.preferences = {};
        }
    } else {
        req.preferences = {};
    }
    next();
};

app.use(parsePreferences);

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

// VULNERABILIDADE [Item 1]: Sem rate limiting
// VULNERABILIDADE [Item 2]: Enumeração de usuário
// VULNERABILIDADE [Item 8]: SQL Injection no login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // VULNERABILIDADE [Item 19]: Hash MD5 sem salt
    const passwordHash = crypto.createHash('md5').update(password || '').digest('hex');
    
    try {
        // VULNERABILIDADE [Item 8]: SQL Injection - concatenação direta
        const userQuery = `SELECT * FROM users WHERE username = '${username}'`;
        const userResult = await pool.query(userQuery);
        
        if (userResult.rows.length === 0) {
            // VULNERABILIDADE [Item 2]: Mensagem específica permite enumeração
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        const user = userResult.rows[0];
        
        if (user.password_hash !== passwordHash) {
            // VULNERABILIDADE [Item 2]: Mensagem específica
            return res.status(401).json({ error: 'Senha incorreta' });
        }
        
        // VULNERABILIDADE [Item 5]: Secret hardcoded
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                is_admin: user.is_admin 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // VULNERABILIDADE [Item 4]: Cookie sem HttpOnly, Secure, SameSite
        res.cookie('token', token, {
            httpOnly: false,  // JavaScript pode acessar
            secure: false,    // Funciona em HTTP
            sameSite: 'none'  // Sem proteção CSRF
        });
        
        res.json({ 
            message: 'Login bem-sucedido',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                is_admin: user.is_admin
            }
        });
    } catch (error) {
        // VULNERABILIDADE [Item 21]: Stack trace exposto
        console.error(error);
        res.status(500).json({ 
            error: 'Erro no servidor',
            details: error.message,
            stack: error.stack
        });
    }
});

// VULNERABILIDADE [Item 3]: Permite senhas fracas
app.post('/api/register', async (req, res) => {
    const { username, email, password, cpf, credit_card } = req.body;
    
    // Sem validação de complexidade de senha!
    
    // VULNERABILIDADE [Item 19]: MD5 sem salt
    const passwordHash = crypto.createHash('md5').update(password || '').digest('hex');
    
    try {
        // VULNERABILIDADE [Item 17]: CPF e cartão em texto claro
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, cpf, credit_card) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email',
            [username, email, passwordHash, cpf, credit_card]
        );
        
        res.status(201).json({ 
            message: 'Usuário criado com sucesso',
            user: result.rows[0]
        });
    } catch (error) {
        // VULNERABILIDADE [Item 21]: Erro verboso
        res.status(500).json({ 
            error: 'Erro ao criar usuário',
            details: error.message,
            stack: error.stack
        });
    }
});

// ============================================
// ROTAS DE PRODUTOS
// ============================================

app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// VULNERABILIDADE [Item 8]: SQL Injection na busca
// VULNERABILIDADE [Item 10]: Reflected XSS
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    
    try {
        // SQL Injection - concatenação direta
        const query = `SELECT * FROM products WHERE name ILIKE '%${q}%' OR description ILIKE '%${q}%'`;
        const result = await pool.query(query);
        
        // VULNERABILIDADE [Item 10]: Termo de busca refletido sem escape
        res.json({
            searchTerm: q,  // Será renderizado no frontend sem escape
            results: result.rows,
            // HTML vulnerável para demonstração
            html: `<h2>Você buscou por: ${q}</h2>`
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message, 
            stack: error.stack,
            query: `Query executada: SELECT * FROM products WHERE name ILIKE '%${q}%'`
        });
    }
});

// ============================================
// ROTAS DE COMENTÁRIOS (XSS)
// ============================================

// VULNERABILIDADE [Item 11]: Stored XSS
app.get('/api/products/:id/comments', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT c.*, u.username FROM comments c 
             JOIN users u ON c.user_id = u.id 
             WHERE c.product_id = $1 ORDER BY c.created_at DESC`,
            [req.params.id]
        );
        // Comentários retornados sem sanitização
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// VULNERABILIDADE [Item 11]: Stored XSS - salva HTML/JS sem sanitização
app.post('/api/products/:id/comments', authenticateToken, async (req, res) => {
    const { content } = req.body;
    
    try {
        // Salva diretamente sem sanitização!
        const result = await pool.query(
            'INSERT INTO comments (product_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
            [req.params.id, req.user.id, content]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS DE PEDIDOS (IDOR/BOLA)
// ============================================

// VULNERABILIDADE [Item 6]: IDOR - não verifica proprietário do pedido
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        // Não verifica se o pedido pertence ao usuário logado!
        const result = await pool.query(
            `SELECT o.*, u.username, u.email, u.cpf, u.credit_card
             FROM orders o JOIN users u ON o.user_id = u.id 
             WHERE o.id = $1`,
            [req.params.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pedido não encontrado' });
        }
        
        // Retorna dados sensíveis do proprietário do pedido
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTAS DE USUÁRIO (Mass Assignment)
// ============================================

// VULNERABILIDADE [Item 24]: Mass Assignment/Exposure
app.get('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Retorna TODOS os campos, incluindo password_hash, cpf, credit_card!
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// VULNERABILIDADE [Item 12]: Sem proteção CSRF na alteração de senha
app.post('/api/users/change-password', authenticateToken, async (req, res) => {
    const { new_password } = req.body;
    
    // Não verifica token CSRF!
    // Não verifica senha atual!
    
    const passwordHash = crypto.createHash('md5').update(new_password || '').digest('hex');
    
    try {
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE id = $2',
            [passwordHash, req.user.id]
        );
        res.json({ message: 'Senha alterada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// VULNERABILIDADE [Item 12]: Sem proteção CSRF na alteração de email
app.post('/api/users/change-email', authenticateToken, async (req, res) => {
    const { new_email } = req.body;
    
    try {
        await pool.query(
            'UPDATE users SET email = $1 WHERE id = $2',
            [new_email, req.user.id]
        );
        res.json({ message: 'Email alterado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTA ADMIN (Broken Access Control)
// ============================================

// VULNERABILIDADE [Item 7]: Falta de RBAC adequado
app.get('/api/admin/users', authenticateToken, async (req, res) => {
    // Verifica apenas o cookie/parâmetro - fácil de manipular!
    const isAdmin = req.cookies.isAdmin === 'true' || 
                    req.query.isAdmin === 'true' || 
                    req.user.is_admin;
    
    if (!isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const result = await pool.query('SELECT * FROM users');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stats', authenticateToken, async (req, res) => {
    // Mesma vulnerabilidade de RBAC
    const isAdmin = req.cookies.isAdmin === 'true' || 
                    req.query.isAdmin === 'true' || 
                    req.user.is_admin;
    
    if (!isAdmin) {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    
    try {
        const usersCount = await pool.query('SELECT COUNT(*) FROM users');
        const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
        const revenue = await pool.query('SELECT SUM(total) FROM orders');
        
        res.json({
            users: usersCount.rows[0].count,
            orders: ordersCount.rows[0].count,
            revenue: revenue.rows[0].sum || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// CARRINHO DE COMPRAS (Lógica de Negócio)
// ============================================

// VULNERABILIDADE [Item 25]: Aceita quantidade negativa
app.post('/api/cart/checkout', authenticateToken, async (req, res) => {
    const { items, coupon_code } = req.body;
    
    try {
        let total = 0;
        const orderItems = [];
        
        for (const item of items) {
            const productResult = await pool.query(
                'SELECT * FROM products WHERE id = $1',
                [item.product_id]
            );
            
            if (productResult.rows.length === 0) {
                return res.status(400).json({ error: `Produto ${item.product_id} não encontrado` });
            }
            
            const product = productResult.rows[0];
            
            // NÃO VALIDA SE QUANTITY É POSITIVA!
            // Permite quantidade negativa para "receber dinheiro de volta"
            const itemTotal = product.price * item.quantity;
            total += itemTotal;
            
            orderItems.push({
                product_id: item.product_id,
                quantity: item.quantity,  // Pode ser negativo!
                price: product.price
            });
        }
        
        // Aplicar cupom (vulnerável a race condition)
        if (coupon_code) {
            const couponResult = await pool.query(
                'SELECT * FROM coupons WHERE code = $1 AND active = true',
                [coupon_code]
            );
            
            if (couponResult.rows.length > 0) {
                const coupon = couponResult.rows[0];
                
                // VULNERABILIDADE [Item 26]: Race condition
                // Verifica e atualiza em operações separadas
                if (coupon.current_uses < coupon.max_uses) {
                    total = total * (1 - coupon.discount_percent / 100);
                    
                    // Gap de tempo permite uso múltiplo simultâneo
                    await pool.query(
                        'UPDATE coupons SET current_uses = current_uses + 1 WHERE code = $1',
                        [coupon_code]
                    );
                }
            }
        }
        
        // Criar pedido
        const orderResult = await pool.query(
            'INSERT INTO orders (user_id, total, status) VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, total, 'pending']
        );
        
        const orderId = orderResult.rows[0].id;
        
        // Inserir itens do pedido
        for (const item of orderItems) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
                [orderId, item.product_id, item.quantity, item.price]
            );
        }
        
        // Atualizar saldo do usuário
        await pool.query(
            'UPDATE users SET balance = balance - $1 WHERE id = $2',
            [total, req.user.id]  // Se total for negativo, ADICIONA saldo!
        );
        
        res.status(201).json({
            message: 'Pedido criado com sucesso',
            order_id: orderId,
            total: total
        });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// ============================================
// UPLOAD DE ARQUIVO (Unrestricted)
// ============================================

// VULNERABILIDADE [Item 14]: Upload sem validação de tipo
app.post('/api/upload/avatar', authenticateToken, upload.single('avatar'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    // Aceita QUALQUER extensão (.php, .exe, .sh, etc.)
    res.json({
        message: 'Avatar enviado com sucesso',
        filename: req.file.filename,
        url: `/uploads/${req.file.filename}`
    });
});

// ============================================
// SSRF (Server-Side Request Forgery)
// ============================================

// VULNERABILIDADE [Item 15]: SSRF sem validação
app.post('/api/fetch-image', authenticateToken, async (req, res) => {
    const { url } = req.body;
    
    try {
        // Não valida a URL! Permite acessar recursos internos
        // Ex: http://localhost:5432, http://169.254.169.254/latest/meta-data/
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            timeout: 5000
        });
        
        const base64 = Buffer.from(response.data).toString('base64');
        const contentType = response.headers['content-type'];
        
        res.json({
            data: `data:${contentType};base64,${base64}`,
            status: response.status,
            headers: response.headers
        });
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            // Vaza informações sobre a rede interna
            details: error.response?.data?.toString() || 'Erro ao buscar URL'
        });
    }
});

// ============================================
// COMMAND INJECTION
// ============================================

// VULNERABILIDADE [Item 9]: Command Injection
app.post('/api/admin/ping', authenticateToken, (req, res) => {
    const { ip } = req.body;
    
    // Não sanitiza input! Permite injeção de comandos
    // Ex: ip = "8.8.8.8; cat /etc/passwd"
    exec(`ping -c 4 ${ip}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ 
                error: error.message,
                stderr: stderr
            });
        }
        
        res.json({
            output: stdout,
            stderr: stderr
        });
    });
});

// ============================================
// PÁGINA HTML PRINCIPAL (com vulnerabilidades client-side)
// ============================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VulnLab Store - Loja Vulnerável</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #eee;
        }
        
        .header {
            background: rgba(0,0,0,0.3);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .logo {
            font-size: 1.8rem;
            font-weight: bold;
            color: #e94560;
        }
        
        .logo span {
            color: #0f3460;
            background: #e94560;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
        }
        
        .nav {
            display: flex;
            gap: 1rem;
        }
        
        .nav button {
            background: transparent;
            border: 1px solid #e94560;
            color: #e94560;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .nav button:hover {
            background: #e94560;
            color: white;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .warning-banner {
            background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
            color: white;
            padding: 1rem;
            text-align: center;
            font-weight: bold;
            border-radius: 8px;
            margin-bottom: 2rem;
        }
        
        .search-box {
            background: rgba(255,255,255,0.1);
            padding: 1.5rem;
            border-radius: 8px;
            margin-bottom: 2rem;
        }
        
        .search-box input {
            width: 80%;
            padding: 0.8rem;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
        }
        
        .search-box button {
            padding: 0.8rem 1.5rem;
            background: #e94560;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 0.5rem;
        }
        
        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
        }
        
        .product-card {
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            padding: 1.5rem;
            border: 1px solid rgba(255,255,255,0.1);
            transition: transform 0.3s;
        }
        
        .product-card:hover {
            transform: translateY(-5px);
        }
        
        .product-card h3 {
            color: #e94560;
            margin-bottom: 0.5rem;
        }
        
        .product-card .price {
            font-size: 1.5rem;
            color: #4ecca3;
            margin: 1rem 0;
        }
        
        .product-card button {
            width: 100%;
            padding: 0.8rem;
            background: #e94560;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.3s;
        }
        
        .product-card button:hover {
            background: #d63651;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        .modal-content {
            background: #1a1a2e;
            padding: 2rem;
            border-radius: 8px;
            width: 400px;
            max-width: 90%;
        }
        
        .modal-content h2 {
            margin-bottom: 1.5rem;
            color: #e94560;
        }
        
        .modal-content input {
            width: 100%;
            padding: 0.8rem;
            margin-bottom: 1rem;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            background: rgba(255,255,255,0.1);
            color: white;
        }
        
        .modal-content button {
            width: 100%;
            padding: 0.8rem;
            background: #e94560;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 0.5rem;
        }
        
        .close-btn {
            background: transparent !important;
            border: 1px solid #e94560 !important;
        }
        
        #searchResults {
            margin-top: 1rem;
            padding: 1rem;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }
        
        .user-info {
            background: rgba(255,255,255,0.1);
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
        }
        
        .comment-section {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }
        
        .comment {
            padding: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        #vulnerabilities-list {
            background: rgba(0,0,0,0.3);
            padding: 1.5rem;
            border-radius: 8px;
            margin-top: 2rem;
        }
        
        #vulnerabilities-list h3 {
            color: #e94560;
            margin-bottom: 1rem;
        }
        
        #vulnerabilities-list ul {
            list-style-position: inside;
        }
        
        #vulnerabilities-list li {
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="logo">Vuln<span>Lab</span> Store</div>
        <nav class="nav">
            <button onclick="showProducts()">Produtos</button>
            <button onclick="showModal('loginModal')">Login</button>
            <button onclick="showModal('registerModal')">Registrar</button>
            <button onclick="showAdminPanel()">Admin</button>
            <button id="logoutBtn" style="display:none" onclick="logout()">Logout</button>
        </nav>
    </header>
    
    <div class="container">
        <div class="warning-banner">
            ⚠️ ATENÇÃO: Esta aplicação é DELIBERADAMENTE VULNERÁVEL. Use apenas para estudos!
        </div>
        
        <div id="userInfo" class="user-info" style="display:none"></div>
        
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Buscar produtos...">
            <button onclick="searchProducts()">Buscar</button>
            <!-- VULNERABILIDADE [Item 10]: Resultado da busca exibido sem escape -->
            <div id="searchResults"></div>
        </div>
        
        <div id="productsContainer" class="products-grid"></div>
        
        <!-- Lista de Vulnerabilidades para referência -->
        <div id="vulnerabilities-list">
            <h3>🔓 Vulnerabilidades Implementadas (28 itens)</h3>
            <ul>
                <li><strong>1. Force Brute:</strong> Sem rate limiting no login</li>
                <li><strong>2. Enumeração:</strong> Mensagens "Usuário não encontrado" / "Senha incorreta"</li>
                <li><strong>3. Senhas Fracas:</strong> Aceita "123456" sem validação</li>
                <li><strong>4. Cookie Inseguro:</strong> Sem HttpOnly, Secure, SameSite</li>
                <li><strong>5. JWT Fraco:</strong> Secret "secret123" hardcoded</li>
                <li><strong>6. IDOR:</strong> /api/orders/:id não verifica proprietário</li>
                <li><strong>7. RBAC Quebrado:</strong> isAdmin=true no cookie/query</li>
                <li><strong>8. SQL Injection:</strong> Login e busca vulneráveis</li>
                <li><strong>9. Command Injection:</strong> /api/admin/ping aceita comandos</li>
                <li><strong>10. Reflected XSS:</strong> Termo de busca refletido</li>
                <li><strong>11. Stored XSS:</strong> Comentários sem sanitização</li>
                <li><strong>12. CSRF:</strong> Alteração de senha sem token</li>
                <li><strong>13. CORS Permissivo:</strong> Access-Control-Allow-Origin: *</li>
                <li><strong>14. Upload Irrestrito:</strong> Aceita .php, .exe, .sh</li>
                <li><strong>15. SSRF:</strong> /api/fetch-image sem whitelist</li>
                <li><strong>16. Desserialização:</strong> node-serialize no cookie</li>
                <li><strong>17. Dados em Texto Claro:</strong> CPF/Cartão sem criptografia</li>
                <li><strong>18. SSL Opcional:</strong> Aceita HTTP puro</li>
                <li><strong>19. Hash Fraco:</strong> MD5 sem salt</li>
                <li><strong>20. Hardcoded Secrets:</strong> AWS keys no código</li>
                <li><strong>21. Verbose Errors:</strong> Stack trace exposto</li>
                <li><strong>22. Log de Senha:</strong> console.log(req.body) no login</li>
                <li><strong>23. Sem Rate Limit:</strong> API sem throttling</li>
                <li><strong>24. Mass Assignment:</strong> Retorna todos os campos do usuário</li>
                <li><strong>25. Preço Negativo:</strong> Quantidade negativa no carrinho</li>
                <li><strong>26. Race Condition:</strong> Cupom aplicável múltiplas vezes</li>
            </ul>
        </div>
    </div>
    
    <!-- Modal de Login -->
    <div id="loginModal" class="modal">
        <div class="modal-content">
            <h2>Login</h2>
            <input type="text" id="loginUsername" placeholder="Usuário">
            <input type="password" id="loginPassword" placeholder="Senha">
            <button onclick="doLogin()">Entrar</button>
            <button class="close-btn" onclick="hideModal('loginModal')">Fechar</button>
            <p id="loginError" style="color: #ff6b6b; margin-top: 1rem;"></p>
        </div>
    </div>
    
    <!-- Modal de Registro -->
    <div id="registerModal" class="modal">
        <div class="modal-content">
            <h2>Criar Conta</h2>
            <input type="text" id="regUsername" placeholder="Usuário">
            <input type="email" id="regEmail" placeholder="Email">
            <input type="password" id="regPassword" placeholder="Senha (pode ser fraca!)">
            <input type="text" id="regCpf" placeholder="CPF">
            <input type="text" id="regCreditCard" placeholder="Cartão de Crédito">
            <button onclick="doRegister()">Registrar</button>
            <button class="close-btn" onclick="hideModal('registerModal')">Fechar</button>
            <p id="registerError" style="color: #ff6b6b; margin-top: 1rem;"></p>
        </div>
    </div>
    
    <!-- Modal de Produto -->
    <div id="productModal" class="modal">
        <div class="modal-content" style="width: 600px;">
            <div id="productDetails"></div>
            <div class="comment-section">
                <h3 style="color: #e94560;">Comentários</h3>
                <div id="productComments"></div>
                <textarea id="newComment" placeholder="Adicionar comentário (HTML permitido!)" 
                    style="width:100%; height:80px; margin-top:1rem; background:rgba(255,255,255,0.1); 
                    border:1px solid rgba(255,255,255,0.2); color:white; padding:0.5rem;"></textarea>
                <button onclick="addComment()" style="margin-top:0.5rem;">Comentar</button>
            </div>
            <button class="close-btn" onclick="hideModal('productModal')" style="margin-top:1rem;">Fechar</button>
        </div>
    </div>
    
    <script>
        // VULNERABILIDADE [Item 20]: Secrets expostos no frontend
        const AWS_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';  // FAKE
        const AWS_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';  // FAKE
        
        let currentUser = null;
        let currentProductId = null;
        
        // Funções de Modal
        function showModal(id) {
            document.getElementById(id).style.display = 'flex';
        }
        
        function hideModal(id) {
            document.getElementById(id).style.display = 'none';
        }
        
        // Carregar produtos
        async function loadProducts() {
            try {
                const response = await fetch('/api/products');
                const products = await response.json();
                
                const container = document.getElementById('productsContainer');
                container.innerHTML = products.map(p => \`
                    <div class="product-card">
                        <h3>\${p.name}</h3>
                        <p>\${p.description}</p>
                        <div class="price">R$ \${parseFloat(p.price).toFixed(2)}</div>
                        <p>Estoque: \${p.stock}</p>
                        <button onclick="viewProduct(\${p.id})">Ver Detalhes</button>
                        <button onclick="addToCart(\${p.id}, -1)" style="background:#ff6b6b; margin-top:0.5rem;">
                            Adicionar -1 (Bug!)
                        </button>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Erro ao carregar produtos:', error);
            }
        }
        
        // VULNERABILIDADE [Item 10]: Reflected XSS
        async function searchProducts() {
            const query = document.getElementById('searchInput').value;
            try {
                const response = await fetch('/api/search?q=' + encodeURIComponent(query));
                const data = await response.json();
                
                // Renderiza HTML sem escape - XSS!
                document.getElementById('searchResults').innerHTML = data.html;
                
                if (data.results && data.results.length > 0) {
                    document.getElementById('searchResults').innerHTML += 
                        '<p>Encontrados: ' + data.results.length + ' produtos</p>';
                }
            } catch (error) {
                document.getElementById('searchResults').innerHTML = 
                    '<p style="color: #ff6b6b;">Erro: ' + error.message + '</p>';
            }
        }
        
        // Login
        async function doLogin() {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    // VULNERABILIDADE [Item 2]: Mostra mensagem específica
                    document.getElementById('loginError').textContent = data.error;
                    return;
                }
                
                currentUser = data.user;
                localStorage.setItem('token', data.token);
                hideModal('loginModal');
                updateUserUI();
                
            } catch (error) {
                document.getElementById('loginError').textContent = 'Erro de conexão';
            }
        }
        
        // Registro
        async function doRegister() {
            const data = {
                username: document.getElementById('regUsername').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPassword').value,  // VULNERABILIDADE [Item 3]: Aceita senha fraca
                cpf: document.getElementById('regCpf').value,  // VULNERABILIDADE [Item 17]: Texto claro
                credit_card: document.getElementById('regCreditCard').value  // VULNERABILIDADE [Item 17]
            };
            
            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (!response.ok) {
                    document.getElementById('registerError').textContent = result.error;
                    return;
                }
                
                alert('Usuário criado! Faça login.');
                hideModal('registerModal');
                
            } catch (error) {
                document.getElementById('registerError').textContent = 'Erro de conexão';
            }
        }
        
        // Ver produto
        async function viewProduct(id) {
            currentProductId = id;
            
            const response = await fetch('/api/products/' + id);
            const product = await response.json();
            
            document.getElementById('productDetails').innerHTML = \`
                <h2 style="color: #e94560;">\${product.name}</h2>
                <p>\${product.description}</p>
                <div class="price" style="font-size: 2rem; color: #4ecca3;">R$ \${parseFloat(product.price).toFixed(2)}</div>
            \`;
            
            loadComments(id);
            showModal('productModal');
        }
        
        // Carregar comentários
        async function loadComments(productId) {
            const response = await fetch('/api/products/' + productId + '/comments');
            const comments = await response.json();
            
            // VULNERABILIDADE [Item 11]: Stored XSS - renderiza HTML sem escape
            document.getElementById('productComments').innerHTML = comments.map(c => \`
                <div class="comment">
                    <strong>\${c.username}</strong>
                    <p>\${c.content}</p>
                </div>
            \`).join('');
        }
        
        // Adicionar comentário
        async function addComment() {
            const content = document.getElementById('newComment').value;
            const token = localStorage.getItem('token');
            
            if (!token) {
                alert('Faça login primeiro!');
                return;
            }
            
            await fetch('/api/products/' + currentProductId + '/comments', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ content })  // VULNERABILIDADE [Item 11]: Aceita HTML/JS
            });
            
            document.getElementById('newComment').value = '';
            loadComments(currentProductId);
        }
        
        // Adicionar ao carrinho (com bug de quantidade negativa)
        async function addToCart(productId, quantity) {
            const token = localStorage.getItem('token');
            
            if (!token) {
                alert('Faça login primeiro!');
                return;
            }
            
            // VULNERABILIDADE [Item 25]: Aceita quantidade negativa
            const response = await fetch('/api/cart/checkout', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    items: [{ product_id: productId, quantity: quantity }]
                })
            });
            
            const result = await response.json();
            
            if (result.total < 0) {
                alert('🎉 Bug explorado! Você GANHOU R$ ' + Math.abs(result.total).toFixed(2));
            } else {
                alert('Pedido criado! Total: R$ ' + result.total.toFixed(2));
            }
        }
        
        // Painel Admin
        async function showAdminPanel() {
            const token = localStorage.getItem('token');
            
            // VULNERABILIDADE [Item 7]: Tenta acessar com isAdmin=true
            const response = await fetch('/api/admin/users?isAdmin=true', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            
            if (response.ok) {
                const users = await response.json();
                alert('Acesso admin obtido! Usuários: ' + JSON.stringify(users, null, 2));
            } else {
                alert('Acesso negado. Tente manipular o cookie isAdmin=true');
            }
        }
        
        // Atualizar UI do usuário
        function updateUserUI() {
            if (currentUser) {
                document.getElementById('userInfo').style.display = 'block';
                document.getElementById('userInfo').innerHTML = \`
                    <strong>Logado como:</strong> \${currentUser.username} 
                    (\${currentUser.is_admin ? 'Admin' : 'Usuário'})
                \`;
                document.getElementById('logoutBtn').style.display = 'inline-block';
            }
        }
        
        // Logout
        function logout() {
            currentUser = null;
            localStorage.removeItem('token');
            document.cookie = 'token=; Max-Age=0';
            document.getElementById('userInfo').style.display = 'none';
            document.getElementById('logoutBtn').style.display = 'none';
            location.reload();
        }
        
        function showProducts() {
            loadProducts();
        }
        
        // Inicialização
        loadProducts();
    </script>
</body>
</html>
    `);
});

// ============================================
// Inicialização do Servidor
// ============================================

// Criar diretório de uploads se não existir
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log('🔓 VulnLab Store - VULNERABLE BY DESIGN');
    console.log('============================================');
    console.log(`🌐 Servidor rodando em http://localhost:${PORT}`);
    console.log('');
    console.log('⚠️  ATENÇÃO: Esta aplicação contém vulnerabilidades');
    console.log('   deliberadas para fins educacionais.');
    console.log('');
    console.log('📋 Vulnerabilidades implementadas:');
    console.log('   - SQL Injection (Login, Busca)');
    console.log('   - XSS Reflected e Stored');
    console.log('   - IDOR/BOLA');
    console.log('   - Command Injection');
    console.log('   - SSRF');
    console.log('   - Desserialização Insegura');
    console.log('   - Upload Irrestrito');
    console.log('   - E mais 20+ vulnerabilidades...');
    console.log('');
    console.log('🔑 Credenciais de teste:');
    console.log('   admin:admin123 (Administrador)');
    console.log('   john:password123');
    console.log('   jane:123456');
    console.log('   bob:qwerty');
    console.log('============================================');
});
