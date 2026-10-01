"""What the bot itself says, in English and French.

The assistant answers in whatever language the question is asked in; these
are only the bot's own lines around it (welcome, balance, buying, errors).
"""

TEXT = {
    'welcome': {
        'en': (
            "👋 <b>Welcome to EduIgnite AI</b>, {name}!\n\n"
            "Ask me anything about school: homework, a hard maths problem, a science topic, exam "
            "preparation. You can also <b>send a photo</b> of a question and I will read it.\n\n"
            "🎁 You get <b>{allowance} free AI credits every day</b>. Simple questions use a few; "
            "long explanations and photo questions use more.\n\n"
            "{guest_line}"
            "Type /help to see everything I can do."
        ),
        'fr': (
            "👋 <b>Bienvenue sur EduIgnite AI</b>, {name} !\n\n"
            "Posez-moi toutes vos questions scolaires : devoirs, un problème de maths difficile, un "
            "sujet de sciences, la préparation d'un examen. Vous pouvez aussi <b>envoyer une photo</b> "
            "d'une question.\n\n"
            "🎁 Vous recevez <b>{allowance} crédits IA gratuits chaque jour</b>. Une question simple en "
            "utilise peu ; les longues explications et les questions en photo en utilisent plus.\n\n"
            "{guest_line}"
            "Tapez /help pour tout ce que je sais faire."
        ),
    },
    'guest_line': {
        'en': "🔗 Already on EduIgnite? /link your account to get 100 free credits a day and your own school data.\n\n",
        'fr': "🔗 Déjà sur EduIgnite ? Liez votre compte avec /link pour 100 crédits gratuits par jour et vos données scolaires.\n\n",
    },
    'help': {
        'en': (
            "<b>EduIgnite AI - what I can do</b>\n\n"
            "💬 Ask any school question in English or French\n"
            "📷 Send a photo of a question (up to 3 in one message)\n"
            "📄 Tap <b>PDF</b> under an answer to download it\n"
            "📊 Answers with graphs or charts come as a PDF automatically\n\n"
            "/balance - your AI credits\n"
            "/buy - buy credits by MTN MoMo or Orange Money\n"
            "/history - your recent credit activity\n"
            "/new - start a new conversation\n"
            "/link - connect your EduIgnite account\n"
            "/language - English / Français"
        ),
        'fr': (
            "<b>EduIgnite AI - ce que je sais faire</b>\n\n"
            "💬 Posez toute question scolaire en français ou en anglais\n"
            "📷 Envoyez la photo d'une question (jusqu'à 3 par message)\n"
            "📄 Touchez <b>PDF</b> sous une réponse pour la télécharger\n"
            "📊 Les réponses avec graphiques arrivent automatiquement en PDF\n\n"
            "/balance - vos crédits IA\n"
            "/buy - acheter des crédits par MTN MoMo ou Orange Money\n"
            "/history - votre activité récente\n"
            "/new - nouvelle conversation\n"
            "/link - lier votre compte EduIgnite\n"
            "/language - English / Français"
        ),
    },
    'balance': {
        'en': (
            "✨ <b>Your AI credits</b>\n\n"
            "🎁 Daily free: <b>{free}</b> / {limit}\n"
            "💳 Purchased: <b>{purchased}</b>\n"
            "Total available: <b>{total}</b>\n\n"
            "Free credits refresh at midnight (Cameroon time). Bought credits never expire."
        ),
        'fr': (
            "✨ <b>Vos crédits IA</b>\n\n"
            "🎁 Gratuits du jour : <b>{free}</b> / {limit}\n"
            "💳 Achetés : <b>{purchased}</b>\n"
            "Total disponible : <b>{total}</b>\n\n"
            "Les crédits gratuits se renouvellent à minuit (heure du Cameroun). Les crédits achetés n'expirent jamais."
        ),
    },
    'free_mode': {
        'en': "✨ EduIgnite AI is <b>free</b> to use right now. Ask as much as you need - no credits are used.",
        'fr': "✨ EduIgnite AI est <b>gratuit</b> en ce moment. Posez autant de questions que nécessaire - aucun crédit n'est utilisé.",
    },
    'welcome_free': {
        'en': (
            "👋 <b>Welcome to EduIgnite AI</b>, {name}!\n\n"
            "Ask me anything about school: homework, a hard maths problem, a science topic, exam "
            "preparation. You can also <b>send a photo</b> of a question and I will read it.\n\n"
            "✨ EduIgnite AI is <b>free</b> to use right now.\n\n"
            "Type /help to see everything I can do."
        ),
        'fr': (
            "👋 <b>Bienvenue sur EduIgnite AI</b>, {name} !\n\n"
            "Posez-moi toutes vos questions scolaires : devoirs, un problème de maths difficile, un "
            "sujet de sciences, la préparation d'un examen. Vous pouvez aussi <b>envoyer une photo</b> "
            "d'une question.\n\n"
            "✨ EduIgnite AI est <b>gratuit</b> en ce moment.\n\n"
            "Tapez /help pour tout ce que je sais faire."
        ),
    },
    'buy_free': {
        'en': "EduIgnite AI is free to use right now, so there is nothing to buy. Just ask!",
        'fr': "EduIgnite AI est gratuit en ce moment, il n'y a donc rien à acheter. Posez votre question !",
    },
    'unlimited': {
        'en': "✨ Your account is not charged for AI. Ask as much as you need.",
        'fr': "✨ Votre compte n'est pas facturé pour l'IA. Posez autant de questions que nécessaire.",
    },
    'thinking': {'en': "⏳ Working on it…", 'fr': "⏳ Je réfléchis…"},
    'reading_photo': {'en': "🔍 Reading your photo…", 'fr': "🔍 Je lis votre photo…"},
    'cost_line': {
        'en': "<i>{used} credits · {total} left</i>",
        'fr': "<i>{used} crédits · il en reste {total}</i>",
    },
    'chart_note': {
        'en': "📊 The chart is drawn in the PDF below.",
        'fr': "📊 Le graphique est dessiné dans le PDF ci-dessous.",
    },
    'pdf_caption': {'en': "📄 Your answer, with its charts.", 'fr': "📄 Votre réponse, avec ses graphiques."},
    'pdf_button': {'en': "📄 PDF", 'fr': "📄 PDF"},
    'paper_found': {
        'en': "📄 Found <b>{count} questions</b> in <i>{title}</i>. Solving all of them in full, with every graph and diagram. This can take a minute or two…",
        'fr': "📄 J'ai trouvé <b>{count} questions</b> dans <i>{title}</i>. Je les résous toutes en détail, avec chaque graphique et schéma. Cela peut prendre une ou deux minutes…",
    },
    'paper_progress': {
        'en': "✍️ Solved {done} of {total} questions…",
        'fr': "✍️ {done} questions résolues sur {total}…",
    },
    'paper_done': {
        'en': "✅ <b>{title}</b>: {solved} of {total} questions solved in full. The complete worked solution, with every graph and diagram drawn, is in the PDF below.",
        'fr': "✅ <b>{title}</b> : {solved} questions résolues sur {total}. La solution complète, avec tous les graphiques et schémas, est dans le PDF ci-dessous.",
    },
    'paper_missed': {
        'en': "⚠️ Not solved this time: {which}. Send that question again on its own.",
        'fr': "⚠️ Non résolue cette fois : {which}. Renvoyez cette question seule.",
    },
    'paper_caption': {'en': "📄 Your full solution.", 'fr': "📄 Votre solution complète."},
    'paper_untitled': {'en': "your paper", 'fr': "votre sujet"},
    'pdf_making': {'en': "Making your PDF…", 'fr': "Création du PDF…"},
    'pdf_gone': {
        'en': "That answer is too old to turn into a PDF. Ask again and tap PDF under the new answer.",
        'fr': "Cette réponse est trop ancienne. Reposez la question et touchez PDF sous la nouvelle réponse.",
    },
    'pdf_failed': {
        'en': "Sorry, the PDF could not be made right now. The answer above is complete.",
        'fr': "Désolé, le PDF n'a pas pu être créé. La réponse ci-dessus est complète.",
    },
    'confirm': {
        'en': "This is a bigger request. It will use about <b>{credits} credits</b> (you have {total}). Continue?",
        'fr': "C'est une demande plus longue. Elle utilisera environ <b>{credits} crédits</b> (vous en avez {total}). Continuer ?",
    },
    'confirm_yes': {'en': "✅ Continue", 'fr': "✅ Continuer"},
    'confirm_no': {'en': "✖ Cancel", 'fr': "✖ Annuler"},
    'cancelled': {'en': "Cancelled. No credits were used.", 'fr': "Annulé. Aucun crédit utilisé."},
    'expired_request': {
        'en': "That request has expired. Please ask again.",
        'fr': "Cette demande a expiré. Veuillez reposer la question.",
    },
    'insufficient': {
        'en': (
            "⚡ <b>Not enough AI credits</b>\n\n"
            "This needs about <b>{required}</b> credits and you have <b>{available}</b>.\n"
            "Your free credits refresh at midnight, or buy exactly what you need now with /buy."
        ),
        'fr': (
            "⚡ <b>Pas assez de crédits IA</b>\n\n"
            "Il faut environ <b>{required}</b> crédits et vous en avez <b>{available}</b>.\n"
            "Vos crédits gratuits se renouvellent à minuit, ou achetez ce qu'il vous faut avec /buy."
        ),
    },
    'guest_upsell': {
        'en': "🔗 With an EduIgnite account you get 100 free credits a day instead of {guest}. Use /link.",
        'fr': "🔗 Avec un compte EduIgnite vous avez 100 crédits gratuits par jour au lieu de {guest}. Utilisez /link.",
    },
    'unavailable': {
        'en': "Sorry, I could not answer that right now. No credits were used. Please try again in a moment.",
        'fr': "Désolé, je n'ai pas pu répondre. Aucun crédit utilisé. Réessayez dans un instant.",
    },
    'error': {
        'en': "Something went wrong on our side. No credits were used. Please try again.",
        'fr': "Un problème est survenu de notre côté. Aucun crédit utilisé. Réessayez.",
    },
    'bad_photo': {
        'en': "I could not read that photo: {reason}",
        'fr': "Je n'ai pas pu lire cette photo : {reason}",
    },
    'unsupported': {
        'en': "I can read text and photos of questions. Send your question as a message or a photo.",
        'fr': "Je lis les messages et les photos de questions. Envoyez votre question en texte ou en photo.",
    },
    'voice_soon': {
        'en': "🎙 Voice questions are coming soon. For now, please type your question or send a photo.",
        'fr': "🎙 Les questions vocales arrivent bientôt. Pour l'instant, écrivez ou envoyez une photo.",
    },
    'slow_down': {
        'en': "You are sending questions very fast. Please wait a moment.",
        'fr': "Vous envoyez des questions très vite. Patientez un instant.",
    },
    'new_chat': {
        'en': "🆕 New conversation. What would you like to learn?",
        'fr': "🆕 Nouvelle conversation. Que voulez-vous apprendre ?",
    },
    'private_only': {
        'en': "Please talk to me in a private chat: open @{bot}.",
        'fr': "Parlez-moi en message privé : ouvrez @{bot}.",
    },
    'language_set': {'en': "Language: English 🇬🇧", 'fr': "Langue : Français 🇫🇷"},
    # --- buying -----------------------------------------------------------
    'buy_closed': {
        'en': "Buying credits opens soon. Your free credits still refresh every day.",
        'fr': "L'achat de crédits ouvre bientôt. Vos crédits gratuits se renouvellent chaque jour.",
    },
    'buy_choose': {
        'en': "💳 <b>Buy AI credits</b>\n\nChoose an amount, or send any number, like <code>/buy 350</code>.\n{min}–{max} credits · {price} FCFA per credit.",
        'fr': "💳 <b>Acheter des crédits IA</b>\n\nChoisissez un montant, ou envoyez un nombre, par exemple <code>/buy 350</code>.\n{min}–{max} crédits · {price} FCFA le crédit.",
    },
    'buy_quote': {
        'en': "💳 <b>{credits} credits</b> for <b>{price} FCFA</b>.\n\nSend the MTN MoMo or Orange Money number to pay from, or tap the button to use this phone's number.",
        'fr': "💳 <b>{credits} crédits</b> pour <b>{price} FCFA</b>.\n\nEnvoyez le numéro MTN MoMo ou Orange Money qui paiera, ou touchez le bouton pour utiliser ce numéro.",
    },
    'share_phone': {'en': "📱 Use my number", 'fr': "📱 Utiliser mon numéro"},
    'buy_bad_phone': {
        'en': "That does not look like a mobile money number. Send it like <code>6XXXXXXXX</code>, or /cancel.",
        'fr': "Ce numéro ne semble pas valide. Envoyez-le comme <code>6XXXXXXXX</code>, ou /cancel.",
    },
    'buy_prompted': {
        'en': "📲 A payment request for <b>{price} FCFA</b> was sent to <b>{phone}</b>. Approve it on your phone - I will tell you as soon as your {credits} credits arrive.",
        'fr': "📲 Une demande de paiement de <b>{price} FCFA</b> a été envoyée au <b>{phone}</b>. Validez-la sur votre téléphone - je vous préviens dès que vos {credits} crédits arrivent.",
    },
    'buy_done': {
        'en': "✅ <b>{credits} credits added!</b> You now have {total} credits.",
        'fr': "✅ <b>{credits} crédits ajoutés !</b> Vous avez maintenant {total} crédits.",
    },
    'buy_failed': {
        'en': "The payment was not completed, so nothing was charged. You can try again with /buy.",
        'fr': "Le paiement n'a pas abouti, rien n'a été débité. Réessayez avec /buy.",
    },
    'buy_timeout': {
        'en': "I have not seen the payment yet. If you approved it, your credits will appear shortly - check /balance.",
        'fr': "Je ne vois pas encore le paiement. Si vous l'avez validé, vos crédits arriveront bientôt - voyez /balance.",
    },
    'buy_error': {'en': "The payment could not start: {reason}", 'fr': "Le paiement n'a pas pu démarrer : {reason}"},
    # --- linking ----------------------------------------------------------
    'link_how': {
        'en': "🔗 <b>Link your EduIgnite account</b>\n\nOpen the EduIgnite app → <b>AI Credits</b> → <b>Connect Telegram</b>, then tap the link it shows, or send the code here like <code>/link ABCD2345</code>.",
        'fr': "🔗 <b>Lier votre compte EduIgnite</b>\n\nOuvrez l'application EduIgnite → <b>Crédits IA</b> → <b>Connecter Telegram</b>, puis touchez le lien affiché, ou envoyez le code ici comme <code>/link ABCD2345</code>.",
    },
    'link_done': {
        'en': "✅ Linked to <b>{name}</b>. You now use your EduIgnite account's credits{moved}.",
        'fr': "✅ Lié à <b>{name}</b>. Vous utilisez maintenant les crédits de votre compte EduIgnite{moved}.",
    },
    'link_moved': {'en': ", and your {n} bought credits came with you", 'fr': ", et vos {n} crédits achetés vous ont suivi"},
    'link_bad': {
        'en': "That code is not valid or has expired. Get a new one in the app (AI Credits → Connect Telegram).",
        'fr': "Ce code n'est pas valide ou a expiré. Obtenez-en un nouveau dans l'application (Crédits IA → Connecter Telegram).",
    },
    'link_already': {
        'en': "This chat is already linked to <b>{name}</b>. Use /unlink first to change it.",
        'fr': "Ce chat est déjà lié à <b>{name}</b>. Utilisez d'abord /unlink pour changer.",
    },
    'unlinked': {
        'en': "Unlinked. You are back on your guest account.",
        'fr': "Délié. Vous êtes de retour sur votre compte invité.",
    },
    'not_linked': {'en': "This chat is not linked to an account.", 'fr': "Ce chat n'est lié à aucun compte."},
    'history_empty': {'en': "No credit activity yet.", 'fr': "Aucune activité pour le moment."},
    'history_title': {'en': "<b>Recent credit activity</b>", 'fr': "<b>Activité récente</b>"},
}


def say(key: str, language: str = 'en', **values) -> str:
    entry = TEXT[key]
    template = entry.get(language) or entry['en']
    return template.format(**values) if values else template
