# 🔒 HTTPS Enforcement Guide for Production

## Why HTTPS is Critical

Without HTTPS:
- ❌ Passwords sent in plain text
- ❌ Session tokens can be stolen
- ❌ Man-in-the-middle attacks possible
- ❌ Browser security warnings
- ❌ SEO penalties

**HTTPS is MANDATORY for production!**

---

## ✅ Hosting Platform Configuration

### Option 1: Vercel (Recommended)

**Good News:** Vercel enforces HTTPS by default! ✅

**Additional Configuration:**

1. **Create `vercel.json` in your project root:**

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains; preload"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/:path*",
      "has": [
        {
          "type": "header",
          "key": "x-forwarded-proto",
          "value": "http"
        }
      ],
      "destination": "https://yourdomain.com/:path*",
      "permanent": true
    }
  ]
}
```

2. **Deploy to Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

3. **Set Environment Variables:**
```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

---

### Option 2: Netlify

**Good News:** Netlify also enforces HTTPS by default! ✅

**Additional Configuration:**

1. **Create `netlify.toml` in your project root:**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"

# Force HTTPS
[[redirects]]
  from = "http://*"
  to = "https://:splat"
  status = 301
  force = true
```

2. **Deploy to Netlify:**
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

3. **Set Environment Variables:**
   - Go to: Site settings → Environment variables
   - Add `VITE_SUPABASE_URL`
   - Add `VITE_SUPABASE_ANON_KEY`

---

### Option 3: Custom Server (Nginx)

If you're hosting on your own server:

**Nginx Configuration:**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Certificate (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Serve your app
    root /var/www/rahestock/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Get Free SSL Certificate:**
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (already set up by certbot)
sudo certbot renew --dry-run
```

---

## 🧪 How to Verify HTTPS is Working

### Test 1: SSL Labs Test
1. Go to: https://www.ssllabs.com/ssltest/
2. Enter your domain
3. Wait for the test to complete
4. **Target Grade: A or A+**

### Test 2: Security Headers Check
1. Go to: https://securityheaders.com/
2. Enter your domain
3. Check all headers are present
4. **Target Grade: A or A+**

### Test 3: Manual Browser Test
1. Visit `http://yourdomain.com` (without HTTPS)
2. Verify it redirects to `https://yourdomain.com`
3. Check for the padlock icon 🔒 in the address bar
4. Click the padlock → Connection should be "Secure"

### Test 4: HSTS Preload Check
1. Go to: https://hstspreload.org/
2. Enter your domain
3. Check if eligible for HSTS preload list
4. Submit for preload (optional but recommended)

---

## 📋 Security Headers Explained

### Strict-Transport-Security (HSTS)
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```
- Forces browsers to only use HTTPS for 1 year
- Applies to all subdomains
- Can be added to browser preload list

### X-Content-Type-Options
```
X-Content-Type-Options: nosniff
```
- Prevents MIME type sniffing attacks
- Forces browser to respect declared content type

### X-Frame-Options
```
X-Frame-Options: DENY
```
- Prevents clickjacking attacks
- Blocks your site from being embedded in iframes

### X-XSS-Protection
```
X-XSS-Protection: 1; mode=block
```
- Enables browser's XSS filter
- Blocks page if XSS attack detected

### Referrer-Policy
```
Referrer-Policy: strict-origin-when-cross-origin
```
- Controls what referrer information is sent
- Protects user privacy

### Permissions-Policy
```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```
- Disables unnecessary browser features
- Reduces attack surface

---

## ✅ Production Deployment Checklist

Before going live:

### SSL/TLS Configuration
- [ ] HTTPS is enforced (HTTP redirects to HTTPS)
- [ ] Valid SSL certificate installed
- [ ] Certificate is not expired
- [ ] Certificate covers all domains (including www)
- [ ] TLS 1.2 or higher enabled
- [ ] Weak ciphers disabled

### Security Headers
- [ ] Strict-Transport-Security header present
- [ ] X-Content-Type-Options header present
- [ ] X-Frame-Options header present
- [ ] X-XSS-Protection header present
- [ ] Referrer-Policy header present
- [ ] CSP header present (already in index.html)

### Testing
- [ ] SSL Labs test shows A or A+
- [ ] Security Headers test shows A or A+
- [ ] HTTP to HTTPS redirect works
- [ ] All resources load over HTTPS (no mixed content)
- [ ] Supabase connection works over HTTPS

### Monitoring
- [ ] SSL certificate auto-renewal configured
- [ ] Expiry monitoring set up
- [ ] Security headers verified in production

---

## 🚀 Quick Start: Deploy to Vercel (Easiest)

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel --prod

# 4. Set environment variables
vercel env add VITE_SUPABASE_URL production
# Paste your Supabase URL when prompted

vercel env add VITE_SUPABASE_ANON_KEY production
# Paste your anon key when prompted

# 5. Redeploy with environment variables
vercel --prod

# Done! Your app is now live with HTTPS ✅
```

---

## 🔗 Useful Tools

- **SSL Test:** https://www.ssllabs.com/ssltest/
- **Security Headers:** https://securityheaders.com/
- **HSTS Preload:** https://hstspreload.org/
- **Mixed Content Checker:** https://www.whynopadlock.com/
- **Let's Encrypt:** https://letsencrypt.org/

---

## ⚠️ Common Issues

### Issue 1: Mixed Content Warnings
**Problem:** Some resources load over HTTP instead of HTTPS

**Solution:**
- Check all external resources use HTTPS
- Update Supabase URL to use HTTPS
- Check image URLs in database

### Issue 2: Certificate Not Trusted
**Problem:** Browser shows "Not Secure" warning

**Solution:**
- Ensure certificate is from trusted CA (Let's Encrypt, etc.)
- Check certificate chain is complete
- Verify domain name matches certificate

### Issue 3: HSTS Not Working
**Problem:** HTTP doesn't redirect to HTTPS

**Solution:**
- Check server configuration
- Verify redirect rules are active
- Clear browser cache and test in incognito mode

---

## 📞 Need Help?

If you encounter issues:
1. Check your hosting platform's documentation
2. Verify DNS settings are correct
3. Test in multiple browsers
4. Use browser DevTools to check for errors
5. Contact your hosting provider's support

---

**Remember:** HTTPS is not optional for production. It's a fundamental security requirement!
