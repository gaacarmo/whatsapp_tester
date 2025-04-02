const { chromium } = require('playwright');
const fs = require('fs');
const readline = require('readline');

// Configurações
const WAIT_FOR_LOGIN = true; // Mudar para false se não quiser esperar login manual
const INPUT_FILE = 'numeros.txt';
const OUTPUT_FILE = 'resultado.txt';
const BASE_URL = 'https://web.whatsapp.com/send/?phone=55';

async function checkNumbers() {
    // Iniciar o navegador
    const browser = await chromium.launch({
        headless: false, // Mostrar o navegador
        args: [
            '--start-maximized',
            '--disable-notifications',
            '--disable-infobars',
            '--ignore-certificate-errors'
        ]
    });

    try {
        const context = await browser.newContext({
            viewport: null, // Maximizar a janela
            ignoreHTTPSErrors: true // Ignorar erros de SSL
        });
        
        const page = await context.newPage();
        
        // Abrir WhatsApp Web
        await page.goto('https://web.whatsapp.com/');
        console.log('-----------------------------------');
        console.log('ATENÇÃO: FAÇA O LOGIN NO WHATSAPP WEB E TECLE ENTER');
        console.log('-----------------------------------');
        
        if (WAIT_FOR_LOGIN) {
            // Esperar usuário pressionar Enter
            await new Promise(resolve => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                rl.question('Pressione ENTER para continuar...', () => {
                    rl.close();
                    resolve();
                });
            });
        }

        // Carregar números de telefone
        const numbers = fs.readFileSync(INPUT_FILE, 'utf-8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        let positivo = 0;
        let negativo = 0;
        const resultados = [];

        for (const numero of numbers) {
            const url = `${BASE_URL}${numero}&text&type=phone_number`;
            await page.goto(url, { waitUntil: 'networkidle' });

            try {
                // Esperar a página carregar
                await page.waitForSelector('body', { timeout: 20000 });
                
                // Delay aleatório para evitar detecção
                await delay(randomDelay(5000, 10000));

                // Verificar se o número é inválido
                const invalidNumber = await page.getByText('O número de telefone compartilhado por url é inválido.').count() > 0;
                
                if (invalidNumber) {
                    negativo++;
                    resultados.push(`Numero: ${numero} - Status: NAO\n`);
                    console.log(`Resultado: ${numero}... NAO`);
                } else {
                    positivo++;
                    resultados.push(`Numero: ${numero} - Status: OK\n`);
                    console.log(`Resultado: ${numero}... OK`);
                }
            } catch (error) {
                console.error(`Erro ao verificar número ${numero}:`, error.message);
                resultados.push(`Numero: ${numero} - Status: ERRO\n`);
            }
        }

        // Salvar resultados
        fs.writeFileSync(OUTPUT_FILE, resultados.join(''));

        // Mostrar resumo
        console.log('\n--- RESULTADO FINAL ---');
        console.log(`TOTAL DE NÚMEROS: ${positivo + negativo}`);
        console.log(`POSITIVO (com WhatsApp): ${positivo}`);
        console.log(`NEGATIVO (sem WhatsApp): ${negativo}`);
        console.log('------------------------');

    } catch (error) {
        console.error('Ocorreu um erro:', error);
    } finally {
        await browser.close();
    }
}

// Funções auxiliares
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Executar o script
checkNumbers();