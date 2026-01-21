-- ============================================
-- VulnLab Store - Database Initialization
-- VULNERABLE BY DESIGN - DO NOT USE IN PRODUCTION
-- ============================================

-- Tabela de usuários
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    -- VULNERABILIDADE [Item 19]: Senhas armazenadas com MD5 sem salt
    password_hash VARCHAR(255) NOT NULL,
    -- VULNERABILIDADE [Item 17]: CPF armazenado em texto claro
    cpf VARCHAR(14),
    -- VULNERABILIDADE [Item 17]: Cartão de crédito em texto claro
    credit_card VARCHAR(20),
    credit_card_cvv VARCHAR(4),
    balance DECIMAL(10,2) DEFAULT 100.00,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de produtos
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de pedidos
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    -- VULNERABILIDADE [Item 17]: Dados sensíveis em texto claro
    shipping_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de itens do pedido
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- Tabela de comentários (para Stored XSS)
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    user_id INTEGER REFERENCES users(id),
    -- VULNERABILIDADE [Item 11]: Comentários armazenados sem sanitização
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de cupons
CREATE TABLE coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- DADOS INICIAIS (FAKE DATA)
-- ============================================

-- Usuários (senhas em MD5 - sem salt)
-- admin:admin123 -> 0192023a7bbd73250516f069df18b500
-- john:password123 -> 482c811da5d5b4bc6d497ffa98491e38
-- jane:123456 -> e10adc3949ba59abbe56e057f20f883e
-- bob:qwerty -> d8578edf8458ce06fbc5bb76a58c5ca4

INSERT INTO users (username, email, password_hash, cpf, credit_card, credit_card_cvv, balance, is_admin) VALUES
('admin', 'admin@vulnlab.com', '0192023a7bbd73250516f069df18b500', '123.456.789-00', '4111111111111111', '123', 10000.00, TRUE),
('john', 'john@example.com', '482c811da5d5b4bc6d497ffa98491e38', '987.654.321-00', '5500000000000004', '456', 500.00, FALSE),
('jane', 'jane@example.com', 'e10adc3949ba59abbe56e057f20f883e', '111.222.333-44', '340000000000009', '789', 250.00, FALSE),
('bob', 'bob@example.com', 'd8578edf8458ce06fbc5bb76a58c5ca4', '555.666.777-88', '30000000000004', '321', 100.00, FALSE);

-- Produtos
INSERT INTO products (name, description, price, stock, image_url) VALUES
('Laptop Gamer Pro', 'Laptop de alta performance para jogos com RTX 4080', 8999.99, 15, '/images/laptop.jpg'),
('Smartphone Ultra', 'Smartphone flagship com câmera de 200MP', 4599.99, 30, '/images/phone.jpg'),
('Fone Bluetooth Elite', 'Fone com cancelamento de ruído premium', 899.99, 50, '/images/headphones.jpg'),
('Smartwatch Sport', 'Relógio inteligente para atletas', 1299.99, 25, '/images/watch.jpg'),
('Teclado Mecânico RGB', 'Teclado mecânico com switches Cherry MX', 599.99, 40, '/images/keyboard.jpg'),
('Mouse Wireless Pro', 'Mouse ergonômico para produtividade', 299.99, 60, '/images/mouse.jpg'),
('Monitor 4K 32"', 'Monitor UHD para profissionais', 2499.99, 20, '/images/monitor.jpg'),
('Cadeira Gamer Deluxe', 'Cadeira ergonômica com massagem', 1899.99, 10, '/images/chair.jpg'),
('Webcam 4K Stream', 'Webcam profissional para streamers', 699.99, 35, '/images/webcam.jpg'),
('SSD NVMe 2TB', 'Armazenamento ultra rápido Gen4', 799.99, 45, '/images/ssd.jpg');

-- Pedidos
INSERT INTO orders (user_id, total, status, shipping_address) VALUES
(2, 9899.98, 'delivered', 'Rua das Flores, 123 - São Paulo, SP - CEP 01234-567'),
(2, 899.99, 'shipped', 'Rua das Flores, 123 - São Paulo, SP - CEP 01234-567'),
(3, 4599.99, 'pending', 'Av. Brasil, 456 - Rio de Janeiro, RJ - CEP 98765-432'),
(4, 1499.98, 'processing', 'Rua Sul, 789 - Curitiba, PR - CEP 11111-222');

-- Itens dos pedidos
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES
(1, 1, 1, 8999.99),
(1, 3, 1, 899.99),
(2, 3, 1, 899.99),
(3, 2, 1, 4599.99),
(4, 5, 1, 599.99),
(4, 3, 1, 899.99);

-- Comentários (incluindo XSS payload para demonstração)
INSERT INTO comments (product_id, user_id, content) VALUES
(1, 2, 'Excelente laptop! Recomendo para todos os gamers.'),
(1, 3, 'Muito caro, mas vale cada centavo.'),
(2, 4, 'Câmera incrível, as fotos ficam perfeitas!'),
(3, 2, 'Cancelamento de ruído funciona muito bem.'),
-- VULNERABILIDADE [Item 11]: XSS payload armazenado
(1, 3, 'Ótimo produto! <script>alert("Stored XSS")</script>');

-- Cupons
INSERT INTO coupons (code, discount_percent, max_uses, current_uses, active) VALUES
('WELCOME10', 10, 100, 5, TRUE),
('BLACKFRIDAY', 50, 50, 48, TRUE),
('VIP25', 25, 10, 2, TRUE),
('EXPIRED20', 20, 100, 100, FALSE);
