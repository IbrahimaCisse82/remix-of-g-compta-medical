import { expect, it } from 'vitest';
import { buildAnnexesHtml } from './dsf-annexes-export';
it('omet les notes non documentées du sommaire et du contenu',()=>{const html=buildAnnexesHtml([],{});expect(html).not.toContain('id="note-2"');expect(html).not.toContain('href="#note-2"');});
it('omet la note obsolète d’étalement même en présence du compte 201',()=>{expect(buildAnnexesHtml([{compte:'201',intitule:'',sd:0,sc:0,md:0,mc:0,sfd:10000,sfc:0}],{})).not.toContain('id="note-8A"');});