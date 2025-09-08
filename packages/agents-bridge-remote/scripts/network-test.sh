#!/bin/bash

# Network connectivity test script for Docker container

echo "🔍 Полная диагностика сетевого подключения"
echo "==========================================="

# 1. Check basic network interfaces
echo "1. Сетевые интерфейсы:"
ip addr show

echo ""
echo "2. Маршрутизация:"
ip route show

echo ""
echo "3. DNS конфигурация:"
cat /etc/resolv.conf

echo ""
echo "4. Тест DNS резолюции:"
for domain in google.com github.com npmjs.com; do
    if nslookup "$domain" > /dev/null 2>&1; then
        echo "✅ $domain - OK"
    else
        echo "❌ $domain - FAIL"
    fi
done

echo ""
echo "5. Тест ping до внешних серверов:"
for ip in 8.8.8.8 1.1.1.1 208.67.222.222; do
    if ping -c 2 -W 5 "$ip" > /dev/null 2>&1; then
        echo "✅ $ip - OK"
    else
        echo "❌ $ip - FAIL"
    fi
done

echo ""
echo "6. Тест HTTP/HTTPS соединений:"
for url in "http://www.google.com" "https://www.github.com" "https://registry.npmjs.org"; do
    if curl -s --connect-timeout 10 --max-time 30 "$url" > /dev/null 2>&1; then
        echo "✅ $url - OK"
    else
        echo "❌ $url - FAIL"
    fi
done

echo ""
echo "7. Тест портов:"
for port in "80:HTTP" "443:HTTPS" "53:DNS"; do
    port_num=$(echo $port | cut -d: -f1)
    port_name=$(echo $port | cut -d: -f2)
    if nc -z -w5 8.8.8.8 $port_num 2>/dev/null; then
        echo "✅ Port $port_num ($port_name) - OK"
    else
        echo "❌ Port $port_num ($port_name) - FAIL"
    fi
done

echo ""
echo "8. Информация о системе:"
echo "Docker version: $(docker --version 2>/dev/null || echo 'Not available')"
echo "OS: $(uname -a)"
echo "Время: $(date)"

echo ""
echo "==========================================="
echo "Диагностика завершена"
