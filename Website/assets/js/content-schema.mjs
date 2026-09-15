// Public content fields shared by Website and Admin. Empty text retains the
// authored website copy, so rollout never replaces existing content with blanks.
const text=(label,group,selector,maxLength=500)=>({label,group,selector,type:'text',default:'',maxLength});
const toggle=(label,group,defaultValue=true)=>({label,group,type:'boolean',default:defaultValue});
export const WEBSITE_FIELDS={
  heroTitle:text('Main headline','Home','#home h1',160),
  heroSubtitle:text('Introduction','Home','#home .kc-hero-sub',350),
  aboutTitle:text('Section title','About','#about .kc-section-title',100),
  aboutSubtitle:text('Short introduction','About','#about .kc-section-sub',250),
  aboutBody:text('About the collective','About','#about [data-variant="callout"] p',1500),
  aboutVisible:toggle('Show the About section','About'),
  programsTitle:text('Section title','Programs','#programs .kc-section-title',100),
  programsVisible:toggle('Show Programs','Programs'),
  janazahTitle:text('Section title','Janazah','#janazah .kc-section-title',100),
  janazahSubtitle:text('Short introduction','Janazah','#janazah .kc-section-sub',250),
  janazahVisible:toggle('Show the Janazah section','Janazah'),
  mapsTitle:text('Section title','Maps','#maps .kc-section-title',100),
  mapsSubtitle:text('Short introduction','Maps','#maps .kc-section-sub',250),
  mapsVisible:toggle('Show the Maps section','Maps'),
  teamTitle:text('Section title','Team','#team .kc-section-title',100),
  teamVisible:toggle('Show the team','Team'),
  contactTitle:text('Section title','Contact','#contact .kc-section-title',100),
  contactIntro:text('Contact introduction','Contact','[data-site-contact-intro]',500),
  updatesEnabled:toggle('Offer the updates signup checkbox','Contact'),
  noticeEnabled:toggle('Show announcement banner','Announcement',false),
  noticeText:text('Announcement','Announcement','[data-site-notice]',350),
  pageTitle:{...text('Browser tab title','Search & sharing','title',100)},
  pageDescription:{...text('Search description','Search & sharing',null,300)},
  instagramUrl:{...text('Instagram link','Links',null,500),type:'url'},
  linkedinUrl:{...text('LinkedIn link','Links',null,500),type:'url'},
};
for(let i=1;i<=4;i++) {
  WEBSITE_FIELDS[`program${i}Title`]=text(`Program ${i} title`,'Programs',`[data-programcard]:nth-child(${i}) .kc-program-title`,120);
  WEBSITE_FIELDS[`program${i}Body`]=text(`Program ${i} description`,'Programs',`[data-programcard]:nth-child(${i}) .kc-program-body-text`,1200);
}
for(const section of ['janazah','maps']) for(let i=1;i<=3;i++) WEBSITE_FIELDS[`${section}Pillar${i}`]=text(`${section==='maps'?'Map feature':'Pillar'} ${i} description`,section==='maps'?'Maps':'Janazah',`#${section} .kc-grid-3 > :nth-child(${i}) .kc-pillar-text`,1000);
export const WEBSITE_DEFAULTS=Object.fromEntries(Object.entries(WEBSITE_FIELDS).map(([key,field])=>[key,field.default]));
export function validateWebsiteContent(content) {
  if(!content||typeof content!=='object'||Array.isArray(content))return 'Invalid website content.';
  for(const [key,value] of Object.entries(content)) {
    const field=Object.hasOwn(WEBSITE_FIELDS,key)?WEBSITE_FIELDS[key]:null;
    if(!field)return `Unknown field: ${key}`;
    if(field.type==='boolean') {if(typeof value!=='boolean')return `${field.label} must be on or off.`;}
    else {
      if(typeof value!=='string'||value.length>field.maxLength)return `${field.label} must be ${field.maxLength} characters or fewer.`;
      if(field.type==='url'&&value) {try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw new Error();}catch{return `${field.label} must be a valid HTTPS address.`;}}
    }
  }
  return null;
}
export function publicWebsiteContent(value) {
  const content={...WEBSITE_DEFAULTS};
  for(const key of Object.keys(WEBSITE_FIELDS)) if(Object.hasOwn(value||{},key)&&!validateWebsiteContent({[key]:value[key]}))content[key]=value[key];
  return content;
}
