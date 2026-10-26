/**
 * Verification words: Nigerian names, places, foods, animals, cloth and music.
 * Lowercase ASCII only, so they read cleanly in an email and are easy to type.
 * Deliberately no generic English words (no "tiger", "apple").
 */
const NAMES = `ikenna chidinma adaeze amaka obinna chiamaka kelechi ifeoma ebuka nkechi chukwudi uchenna nnamdi chinedu
ngozi nneka chioma obiageli ikechukwu somadina tochukwu ogechi adaugo oluchi chinonso ifeanyi amarachi chibuike
tunde bisi funmilayo yetunde seun dayo femi tobi bolaji kunle sade ayodele lola titilayo adebayo olumide temitope
folake gbenga jide kayode modupe abiodun damilola oyinkansola bukola tolani adunni morayo ireoluwa kehinde taiwo
aminu hauwa zainab danladi garba yakubu ladi asabe binta jummai nasiru kabiru habiba hadiza lami bilkisu sadiya
efe ese oghenero tejiri ejiro ovie onome bassey effiong ekaette nsikak idara ubong aniekan ekene ukeme terver
msughter iember doosuur aondona ene ojonugwa ugbede ehi osaro osas imade itohan eghosa izoduwa nosa ibiere tamuno
boma ibim soye`;

const PLACES = `kaduna kano enugu ibadan abeokuta owerri onitsha calabar makurdi lokoja ilorin osogbo akure ijebu sokoto
katsina zaria bauchi gombe yola maiduguri minna lafia umuahia awka nnewi asaba warri sapele yenagoa uyo ikom obudu
badagry ikorodu lekki ikeja yaba surulere ogbomoso iseyin offa bida kontagora nsukka abakaliki afikpo ogoja oron eket
opobo okrika degema idah ankpa otukpo keffi wukari jalingo mubi potiskum nguru hadejia dutse kazaure funtua gusau
argungu yauri zuru jebba ilesa ede iwo ikire okene kabba auchi ekpoma uromi agbor ughelli kwale oguta orlu okigwe
mbaise arochukwu ohafia bende umueri idanre ikogosi erin oke olumo zuma kainji gurara obudu yankari oyo ondo ekiti
anambra imo abia ebonyi  bayelsa  kogi kwara benue nasarawa  taraba adamawa borno yobe jigawa
zamfara kebbi `;

const FOODS = `suya jollof egusi ogbono amala fufu moinmoin akara puffpuff chinchin kilishi tuwo masa kunu zobo garri ofada
ewedu gbegiri edikang afang banga nkwobi isiewu abacha ugba okpa boli ikokore ekuru oha onugbu ukodo dankwa fura
nono waina dambu gwate kokoro ofeakwu ewa agoyin ikpekere asun ponmo dundun ojojo ekpang ukwa achicha nsala
ogiri iru dakuwa alkaki kosai miyan taushe gurasa`;

const ANIMALS_AND_CULTURE = `ijapa mbe nkita ewure adie okuko ologbo ekun agu erin enyi zaki giwa kura rakumi doki akuya kifi eja azu enwe obo
okere agbo ehoro adire asooke akwete gele agbada buba iro isiagu babanriga dundun gangan sekere udu ogene ekwe
kakaki goje kalangu bata apala  fuji  ikoro oja mmanwu egungun gelede durbar argungu eyo ofala
iriji iwaji ekpe ekpo abang leboku`;

function parse(list: string) {
  return list.split(/\s+/).map((w) => w.trim()).filter((w) => /^[a-z]{3,12}$/.test(w));
}

/** Unique word list (diacritics removed so words are easy to type). */
export const NIGERIAN_WORDS: readonly string[] = [
  ...new Set([...parse(NAMES), ...parse(PLACES), ...parse(FOODS), ...parse(ANIMALS_AND_CULTURE)]),
];
