import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Languages,
  Library,
  MessageCircle,
  NotebookPen,
  QrCode,
  ShieldCheck,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { PageHero, Section, SectionHeading } from "@/components/public/sections";
import {
  faqSchema,
  organizationSchema,
  pageMetadata,
  schemaGraph,
  softwareApplicationSchema,
  webPageSchema,
} from "@/lib/seo";

/**
 * The French half of the country searches in French.
 *
 * Cameroon is bilingual and so is the platform, but every public page here was
 * in English, which left "logiciel de gestion scolaire au Cameroun" - the same
 * question, asked by half the market - to competitors who do have a French
 * page. This is the French counterpart of
 * /school-management-system-cameroon, and the two point at each other with
 * hreflang so Google serves the right one to the right person.
 */

const PAGE = {
  title: "Logiciel de gestion scolaire au Cameroun | EduIgnite",
  description:
    "Logiciel de gestion scolaire bilingue pour la maternelle, le primaire et le secondaire au Cameroun : bulletins, frais en FCFA. Universités bientôt.",
  path: "/logiciel-de-gestion-scolaire-cameroun",
};

export const metadata: Metadata = {
  ...pageMetadata(PAGE),
  alternates: {
    canonical: PAGE.path,
    languages: {
      "fr-CM": PAGE.path,
      "en-CM": "/school-management-system-cameroon",
      "x-default": "/school-management-system-cameroon",
    },
  },
  openGraph: {
    ...pageMetadata(PAGE).openGraph,
    locale: "fr_FR",
  },
};

const FONCTIONS = [
  {
    icon: Users,
    title: "Élèves et inscriptions",
    body: "Un dossier par élève, avec les parents, la photo et les informations d'inscription, de son arrivée à son départ. Chaque élève reçoit une carte scolaire vérifiable par QR code.",
  },
  {
    icon: ClipboardCheck,
    title: "Présences",
    body: "L'enseignant fait l'appel depuis son téléphone, heure par heure. Les parents sont informés le jour même de l'absence de leur enfant, dans l'application.",
  },
  {
    icon: NotebookPen,
    title: "Notes et bulletins",
    body: "Les notes de séquence sont saisies une fois : moyennes, rangs, appréciations et profil de la classe sont calculés automatiquement. Les bulletins et relevés s'impriment dans la présentation officielle bilingue.",
  },
  {
    icon: Wallet,
    title: "Frais de scolarité et reçus",
    body: "Un versement est enregistré en FCFA et le reçu s'imprime aussitôt. Le registre montre qui a payé, qui a payé en partie et qui doit encore, par classe ou pour tout l'établissement.",
  },
  {
    icon: MessageCircle,
    title: "Messagerie et annonces",
    body: "Personnel, parents et élèves au même endroit : une information atteint ceux qu'elle concerne, au lieu de se perdre dans un groupe WhatsApp.",
  },
  {
    icon: Library,
    title: "Bibliothèque et documents",
    body: "Les prêts avec suivi automatique des retards, et tous les documents officiels de l'établissement, chacun vérifiable par son QR code.",
  },
];

const POUR_LE_CAMEROUN = [
  {
    icon: Languages,
    title: "Français et anglais, partout",
    body: "Pas un menu traduit par-dessus un système anglais. Les deux langues traversent l'interface et les documents que l'établissement délivre, parce qu'un pays bilingue délivre des documents bilingues.",
  },
  {
    icon: WifiOff,
    title: "Fonctionne même sans courant",
    body: "Appels, versements, reçus et notes enregistrés pendant une coupure restent sur l'appareil et se synchronisent dès le retour de la connexion. Une édition entièrement hors ligne existe pour les établissements sans internet fiable.",
  },
  {
    icon: ShieldCheck,
    title: "L'année scolaire camerounaise",
    body: "Trois trimestres, six séquences, premier et second cycle, sous-systèmes général et technique, coefficients et barème que vos enseignants utilisent déjà.",
  },
  {
    icon: QrCode,
    title: "Des documents vérifiables",
    body: "Un bulletin, un relevé ou une carte scolaire porte un QR code. En le scannant, la plateforme confirme si le document est authentique - ce qui compte quand un relevé décide d'une admission.",
  },
];

const COMPARAISON = [
  ["Ce que fait l'établissement aujourd'hui", "Ce qui change avec EduIgnite"],
  ["Notes dans des cahiers, moyennes calculées à la main à chaque séquence", "Notes saisies une fois ; moyennes, rangs et appréciations calculés"],
  ["Bulletins tapés sous Word, un fichier par élève", "Bulletins générés pour toute une classe, présentation officielle"],
  ["Frais dans un cahier de caisse, reçus sur un carnet à souches", "Versement enregistré une fois, reçu imprimé, solde visible par classe"],
  ["Les parents découvrent les résultats en fin de trimestre", "Les parents suivent présences, notes et frais au fil de l'année"],
  ["Des dossiers dans un bureau, consultables depuis ce bureau seulement", "Les mêmes dossiers sur web, Android et Windows"],
];

const FAQ = [
  {
    question: "Qu'est-ce qu'un logiciel de gestion scolaire ?",
    answer:
      "Un logiciel de gestion scolaire réunit au même endroit les dossiers et le travail quotidien d'un établissement : élèves et parents, personnel, présences, notes, bulletins, frais de scolarité, emploi du temps, bibliothèque et communication avec les familles. L'information est saisie une seule fois, et chacun - administration, enseignants, parents, élèves - voit la partie qui le concerne.",
  },
  {
    question: "EduIgnite convient-il aux établissements camerounais ?",
    answer:
      "Oui. EduIgnite est conçu pour le Cameroun et non adapté après coup : français et anglais partout, année de trois trimestres et six séquences, premier et second cycle, sous-systèmes général et technique, frais en FCFA, bulletins et relevés dans la présentation officielle bilingue.",
  },
  {
    question: "EduIgnite fonctionne-t-il pour les écoles maternelles et primaires ?",
    answer:
      "Oui. EduIgnite est conçu pour la maternelle, l'école primaire et le secondaire au Cameroun. Chaque niveau garde ses propres classes, son personnel, ses élèves, ses présences, ses évaluations, ses bulletins et ses frais dans le même système, en français et en anglais : un établissement qui compte plusieurs sections peut tout gérer depuis un seul compte.",
  },
  {
    question: "Les universités sont-elles prises en charge ?",
    answer:
      "Pas encore. La prise en charge des universités arrive bientôt. Aujourd'hui, EduIgnite sert la maternelle, le primaire et le secondaire. Si votre établissement est une université, contactez-nous et nous vous dirons quand ce sera prêt.",
  },
  {
    question: "Fonctionne-t-il sans connexion internet ?",
    answer:
      "Oui. Les présences, versements, reçus et notes saisis pendant une coupure restent sur l'appareil et se synchronisent automatiquement au retour de la connexion. Les établissements sans internet fiable peuvent utiliser l'édition bureau entièrement hors ligne.",
  },
  {
    question: "Que faut-il pour commencer ?",
    answer:
      "Un appareil avec un navigateur. Rien à installer pour utiliser la plateforme sur le web, et des applications Android et Windows existent pour les établissements qui les préfèrent. L'établissement demande un compte, EduIgnite crée l'établissement et le compte administrateur, puis l'établissement enregistre lui-même ses classes, son personnel et ses élèves.",
  },
  {
    question: "Les parents et les élèves ont-ils accès à leurs informations ?",
    answer:
      "Oui. Parents et élèves disposent de leur propre compte et voient ce qui les concerne : présences, notes, bulletins, solde des frais et messages de l'établissement. Ce que chacun peut consulter dépend de son rôle : un parent voit ses enfants, un enseignant ses classes.",
  },
  {
    question: "Les données sont-elles protégées ?",
    answer:
      "Chaque compte se connecte avec son propre matricule et son mot de passe, et son accès dépend de son rôle et de son établissement. Les dossiers d'un établissement ne sont jamais visibles par un autre.",
  },
];

export default function LogicielGestionScolaireCamerounPage() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          softwareApplicationSchema(),
          {
            ...webPageSchema({
              name: PAGE.title,
              description: PAGE.description,
              path: PAGE.path,
              crumbs: [
                { name: "Accueil", path: "/" },
                { name: "Logiciel de gestion scolaire au Cameroun", path: PAGE.path },
              ],
            }),
            inLanguage: "fr",
          },
          faqSchema(FAQ),
        )}
      />

      <PageHero
        eyebrow="Pour les établissements camerounais"
        title="Un logiciel de gestion scolaire conçu pour le Cameroun"
        blurb="EduIgnite réunit inscriptions, présences, notes, bulletins, frais de scolarité et messagerie avec les familles pour la maternelle, le primaire et le secondaire - en français et en anglais, sur web, Android et Windows, et malgré les coupures de courant et de réseau."
      />

      <Section>
        <div className="mx-auto max-w-3xl space-y-5 text-[1.0625rem] leading-[1.8] text-slate-600">
          <p>
            La plupart des établissements camerounais possèdent déjà l&apos;information dont ils ont
            besoin. Elle est simplement éparpillée : les notes dans des cahiers, les frais dans un
            cahier de caisse, les inscriptions dans un classeur, et la réponse à «&nbsp;comment va
            cet élève&nbsp;?&nbsp;» quelque part entre les trois. Un logiciel de gestion scolaire
            n&apos;ajoute pas d&apos;information : il rassemble celle que l&apos;établissement tient
            déjà, pour qu&apos;une seule saisie suffise.
          </p>
          <p>
            EduIgnite est ce logiciel, écrit pour la façon dont les établissements camerounais
            fonctionnent réellement. Il couvre toute l&apos;année, de l&apos;inscription d&apos;un
            nouvel élève à la délivrance du relevé, et sert l&apos;administration, l&apos;économat,
            les enseignants, les parents et les élèves - chacun voyant ce qui le concerne. Il sert les
            écoles de tous les niveaux : maternelle, primaire et secondaire, avec les universités
            bientôt.
          </p>
        </div>
      </Section>

      <Section surface="tint">
        <SectionHeading
          eyebrow="Ce qu'il gère"
          title="Tout l'établissement, pas une seule partie"
          blurb="Chaque fonction s'appuie sur les mêmes dossiers : rien n'est saisi deux fois."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FONCTIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-slate-200/70 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_36px_-24px_rgba(18,49,77,0.18)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#12314d] text-white">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-[#0B1F33]">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Pensé pour le Cameroun"
          title="Pourquoi un logiciel conçu ailleurs convient rarement"
          blurb="Un établissement d'ici a besoin de quatre choses que la plupart des logiciels scolaires traitent en dernier."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {POUR_LE_CAMEROUN.map((item) => (
            <div key={item.title} className="flex gap-5 rounded-3xl border border-slate-200/70 p-7">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#67D0E4]/15 text-[#12314d]">
                <item.icon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#0B1F33]">{item.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section surface="tint">
        <SectionHeading
          eyebrow="Avant et après"
          title="Ce qui change vraiment au secrétariat"
          blurb="Le travail ne disparaît pas. Il cesse d'être fait deux fois."
        />
        <div className="mx-auto mt-12 max-w-4xl overflow-x-auto">
          <table className="w-full border-collapse overflow-hidden rounded-2xl bg-white text-left text-[15px]">
            <thead>
              <tr className="bg-[#12314d] text-white">
                {COMPARAISON[0].map((heading) => (
                  <th key={heading} className="px-6 py-4 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARAISON.slice(1).map(([avant, apres]) => (
                <tr key={avant} className="border-t border-slate-200/70 align-top">
                  <td className="px-6 py-4 text-slate-600">{avant}</td>
                  <td className="px-6 py-4 font-medium text-[#0B1F33]">
                    <span className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[#12314d]" />
                      {apres}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="Ce que les établissements demandent avant de commencer" />
        <div className="mx-auto mt-12 max-w-3xl divide-y divide-slate-200/70">
          {FAQ.map((item) => (
            <div key={item.question} className="py-7">
              <h3 className="text-lg font-bold text-[#0B1F33]">{item.question}</h3>
              <p className="mt-3 text-[15px] leading-[1.8] text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section surface="tint">
        <div className="mx-auto max-w-3xl rounded-[2rem] bg-[#12314d] px-8 py-14 text-center text-white sm:px-14">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Inscrivez votre établissement sur EduIgnite
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">
            Présentez-nous votre établissement et nous le mettons en place, avec le compte
            administrateur prêt à enregistrer classes, personnel et élèves.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/school-account-request"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-bold text-[#12314d] transition-transform hover:-translate-y-0.5"
            >
              Demander un compte établissement
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-4 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
            >
              Télécharger les applications
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/60">
            Also in English:{" "}
            <Link href="/school-management-system-cameroon" className="underline underline-offset-4">
              school management system in Cameroon
            </Link>
          </p>
        </div>
      </Section>
    </>
  );
}
