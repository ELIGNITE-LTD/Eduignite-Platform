import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { FaqList, FeatureGrid } from "@/components/public/marketing";
import type { ContentSection } from "@/components/public/marketing";
import { PageHero, Section, SectionHeading } from "@/components/public/sections";
import type { Faq } from "@/lib/marketing-content";
import {
  faqSchema, organizationSchema, pageMetadata, schemaGraph, softwareApplicationSchema, webPageSchema,
} from "@/lib/seo";

const PAGE = {
  title: "Logiciel de gestion universitaire au Cameroun | EduIgnite",
  description:
    "Logiciel pour les universités et établissements d'enseignement supérieur du Cameroun : filières, unités d'enseignement avec crédits, enseignants, étudiants, notes par semestre (GPA sur 4,0 ou sur 20), relevés de notes avec QR code et frais.",
  path: "/logiciel-de-gestion-universite-cameroun",
};

export const metadata: Metadata = {
  ...pageMetadata(PAGE),
  alternates: {
    canonical: PAGE.path,
    languages: {
      "fr-CM": PAGE.path,
      "en-CM": "/university-management-software-cameroon",
      "x-default": "/university-management-software-cameroon",
    },
  },
  openGraph: {
    ...pageMetadata(PAGE).openGraph,
    locale: "fr_FR",
  },
};

const SECTIONS: ContentSection[] = [
  {
    id: "academique",
    title: "Filières, unités d'enseignement et semestres",
    blurb: "La structure académique d'une université ou d'un établissement supérieur camerounais, au même endroit.",
    items: [
      { icon: "layers", title: "Filières et départements", body: "Créez les filières de l'établissement, avec facultés ou départements si vous en utilisez, et inscrivez chaque étudiant dans la filière qu'il suit." },
      { icon: "notebook", title: "Unités d'enseignement et crédits", body: "Définissez chaque unité d'enseignement avec sa valeur en crédits et le semestre auquel elle appartient." },
      { icon: "calendar", title: "Semestres", body: "Les résultats sont organisés par semestre au sein de chaque année académique." },
      { icon: "graduation", title: "Cursus camerounais", body: "Pensé pour le système LMD (Licence, Master, Doctorat) et utilisable pour le HND, le BTS et d'autres filières de l'enseignement supérieur, dans les systèmes francophone et anglophone." },
    ],
  },
  {
    id: "personnes",
    title: "Enseignants et étudiants",
    items: [
      { icon: "users", title: "Étudiants", body: "Un dossier par étudiant, avec la filière dans laquelle il est inscrit." },
      { icon: "clipboard", title: "Enseignants", body: "Affectez les enseignants aux unités d'enseignement pour que les bonnes personnes saisissent les notes de chacune." },
      { icon: "languages", title: "Français et anglais", body: "L'interface et les documents délivrés par l'établissement fonctionnent dans les deux langues officielles." },
    ],
  },
  {
    id: "resultats",
    title: "Notes, relevés et frais",
    items: [
      { icon: "award", title: "Notation sur 4,0 ou sur 20", body: "Notez sur une échelle GPA de 4,0 ou avec des notes sur 20, selon ce que votre établissement applique." },
      { icon: "qr", title: "Relevés de notes avec QR code", body: "Les relevés portent un QR code. Le scanner ouvre une page publique qui confirme l'authenticité du document, sans compte." },
      { icon: "wallet", title: "Frais de scolarité", body: "Enregistrez les frais en FCFA, avec reçus et soldes." },
    ],
  },
];

const FAQ: Faq[] = [
  {
    question: "EduIgnite prend-il en charge les universités et l'enseignement supérieur au Cameroun ?",
    answer:
      "Oui. Les universités et autres établissements d'enseignement supérieur sont un segment pris en charge, au même titre que le primaire et le secondaire : filières, unités d'enseignement avec crédits, enseignants, étudiants, notes par semestre, relevés de notes et frais.",
  },
  {
    question: "Peut-on noter sur un GPA de 4,0 ou sur 20 ?",
    answer: "Oui. Les deux modes de notation sont pris en charge, pour que l'établissement applique celui que sa réglementation exige.",
  },
  {
    question: "Les relevés de notes sont-ils vérifiables ?",
    answer: "Oui. Chaque relevé porte un QR code. Le scanner ouvre une page publique qui confirme que le document est authentique, sans avoir besoin d'un compte.",
  },
  {
    question: "Est-ce adapté au LMD, au HND et au BTS ?",
    answer:
      "Le système est organisé autour des filières, des unités d'enseignement, des crédits et des semestres, ce qui correspond au cursus LMD (Licence, Master, Doctorat). Les établissements qui proposent le HND, le BTS ou d'autres filières peuvent les configurer de la même manière. Contactez-nous pour vérifier l'adéquation avec votre établissement.",
  },
  {
    question: "Est-ce disponible en anglais ?",
    answer: "Oui. EduIgnite fonctionne en français et en anglais, dans l'interface comme dans les documents délivrés. Voir la page en anglais : university management software in Cameroon.",
  },
];

export default function LogicielUniversitePage() {
  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          softwareApplicationSchema(),
          webPageSchema({
            name: PAGE.title,
            description: PAGE.description,
            path: PAGE.path,
            inLanguage: "fr",
            crumbs: [
              { name: "Accueil", path: "/" },
              { name: "Logiciel de gestion universitaire au Cameroun", path: PAGE.path },
            ],
          }),
          faqSchema(FAQ),
        )}
      />

      <PageHero
        eyebrow="Universités et enseignement supérieur"
        title="Un logiciel de gestion universitaire pour le Cameroun"
        blurb="Filières, unités d'enseignement avec crédits, enseignants, étudiants, notes par semestre et relevés de notes avec QR code, en français et en anglais."
      />

      <Section>
        <p className="mx-auto max-w-3xl text-[1.0625rem] leading-[1.8] text-slate-600">
          Une université ou un établissement supérieur organise son travail autour de filières,
          d&apos;unités d&apos;enseignement et de semestres plutôt que de classes et de trimestres.
          EduIgnite suit cette structure : les enseignants saisissent les résultats de leurs unités
          d&apos;enseignement et l&apos;établissement peut délivrer des relevés de notes vérifiables.
        </p>
      </Section>

      {SECTIONS.map((section, index) => (
        <Section key={section.id} id={section.id} surface={index % 2 === 0 ? "tint" : "light"}>
          <h2 className="font-serif text-2xl font-bold text-[#12314d] sm:text-3xl">{section.title}</h2>
          {section.blurb ? <p className="mt-2 max-w-2xl text-slate-600">{section.blurb}</p> : null}
          <div className="mt-6">
            <FeatureGrid items={section.items} />
          </div>
        </Section>
      ))}

      <Section id="faq">
        <SectionHeading eyebrow="FAQ" title="Questions fréquentes" />
        <div className="mt-10">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <Section surface="dark">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Équipez votre établissement avec EduIgnite
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">
            Présentez-nous votre établissement et nous le configurons, avec le compte de son
            administrateur prêt à l&apos;emploi.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/school-account-request"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-bold text-[#12314d] transition-transform hover:-translate-y-0.5"
            >
              Demander un compte établissement
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-8 text-sm text-white/60">
            Also in English:{" "}
            <Link href="/university-management-software-cameroon" className="underline underline-offset-4">
              university management software in Cameroon
            </Link>
            {" "}·{" "}
            <Link href="/logiciel-de-gestion-scolaire-cameroun" className="underline underline-offset-4">
              logiciel de gestion scolaire
            </Link>
          </p>
        </div>
      </Section>
    </>
  );
}
