/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

const EMAIL_LIST_VERIFY_API_KEY = 'w4tKzj21sSFfCHgMfTe8x';
const EMAIL_LIST_VERIFY_ENDPOINT = 'https://app.emaillistverify.com/api/verifyEmail';

async function handleRequest(request) {
    // Gérer les requêtes OPTIONS pour les requêtes préalables CORS
    if (request.method === "OPTIONS") {
        return handleOptions(request);
    } else if (request.method === "POST") {
        const { email } = await request.json();
        const url = `${EMAIL_LIST_VERIFY_ENDPOINT}?secret=${EMAIL_LIST_VERIFY_API_KEY}&email=${encodeURIComponent(email)}`;

        const emailVerificationResponse = await fetch(url);
        const text = await emailVerificationResponse.text();

        let verificationResult;
        switch (text) {
        case 'ok':
        case 'error':
        case 'smtp_error':
        case 'smtp_protocol':
        case 'unknown_email':
        case 'attempt_rejected':
        case 'relay_error':
        case 'antispam_system':
        case 'email_disabled':
        case 'domain_error':
        case 'ok_for_all':
        case 'dead_server':
        case 'syntax_error':
        case 'unknown':
        case 'accept_all':
        case 'disposable':
        case 'spam_traps':
            verificationResult = { result: text };
            break;
        default:
            try {
                verificationResult = JSON.parse(text);
            } catch (error) {
                console.error('Invalid JSON:', text);
                throw new Error('Invalid JSON received from the API');
            }
        }

        const response = new Response(JSON.stringify(verificationResult), {
            headers: { 'Content-Type': 'application/json' },
        });

        // Ajouter les en-têtes CORS à la réponse
        setCorsHeaders(response);
        return response;
    } else {
        return new Response('Méthode non supportée', { status: 405 });
    }
}

function handleOptions(request) {
    // Assurez-vous de personnaliser les en-têtes en fonction de vos besoins spécifiques
    let headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Renvoyer une réponse pour les requêtes OPTIONS avec les en-têtes CORS
    return new Response(null, {
        headers: headers,
        status: 204, // No Content
    });
}

function setCorsHeaders(response) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
}