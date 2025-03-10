import time
import random
from selenium import webdriver
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.common.exceptions import NoSuchElementException, WebDriverException

# Configuração do Selenium para Chrome
options = webdriver.ChromeOptions()
options.add_argument("--start-maximized")  # Abre o navegador maximizado
options.add_argument("--disable-notifications")  # Desativa notificações do Chrome
options.add_argument("--disable-infobars")  # Remove popups de aviso
options.add_argument("--ignore-certificate-errors")  # Ignora erros de SSL

servico = Service(ChromeDriverManager().install())
navegador = webdriver.Chrome(service=servico, options=options)

try:
    # Abrir WhatsApp Web
    navegador.get('https://web.whatsapp.com/')
    navegador.implicitly_wait(5.0)

    # Pedir para o usuário fazer login
    print('-----------------------------------')
    print('ATENÇÃO: FAÇA O LOGIN NO WHATSAPP WEB E TECLE ENTER')
    print('-----------------------------------')
    input('Pressione ENTER para continuar...')

    # Carregar lista de números
    with open('numeros.txt', 'r') as arquivo_numeros:
        numeros = [linha.strip() for linha in arquivo_numeros]

    # Abrir arquivo para salvar resultados
    with open('resultado.txt', 'w') as arquivo_resultado:
        positivo, negativo = 0, 0
        resultados = []

        for numero in numeros:
            url = f'https://web.whatsapp.com/send/?phone=55{numero}&text&type=phone_number'
            navegador.get(url)
            navegador.implicitly_wait(10.0)

            # Pausa aleatória para evitar bloqueios
            time.sleep(random.uniform(3, 7))

            # Obtém o texto da página
            page_text = navegador.page_source
    
            # Verifica se a mensagem de erro indicando que o número não está no WhatsApp está presente
            if "O número de telefone compartilhado por url é inválido." in page_text:
                status = "NAO WHATSAPP"
                negativo += 1
            else:
                status = "OK"
                positivo += 1

            # Exibir e salvar o resultado
            print(f"Resultado: {numero}... {status}")
            resultados.append(f"Numero: {numero} - Status: {status}\n")

        # Salvar todos os resultados no arquivo
        arquivo_resultado.writelines(resultados)

    # Exibir resumo final
    print('\n--- RESULTADO FINAL ---')
    print(f"TOTAL DE NÚMEROS: {positivo + negativo}")
    print(f"POSITIVO (com WhatsApp): {positivo}")
    print(f"NEGATIVO (sem WhatsApp): {negativo}")
    print('------------------------')

except WebDriverException as e:
    print(f"Erro no WebDriver: {e}")

finally:
    # Fechar o navegador corretamente
    navegador.quit()
