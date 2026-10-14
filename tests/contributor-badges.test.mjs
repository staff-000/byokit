import test from 'node:test';
import assert from 'node:assert/strict';
import {contributorBadges,contributorBadgeSvg,badgeMarkdown} from '../website/contributor-badges.js';
const record=(changes={})=>({id:'website:123:report-one',offeringId:'deepseek/test',contributor:'github:Verifier',checkedAt:'2026-01-01T00:00:00Z',result:'passed',checks:['textGeneration'],adapter:'byokit-website@1',evidence:'https://github.com/staff-000/byokit/issues/2',...changes});
test('one published success earns a permanent badge with public evidence and profile links',()=>{
 const [badge]=contributorBadges([record()]);assert.equal(badge.name,'Model Verifier');assert.equal(badge.login,'Verifier');assert.equal(badge.verifiedModels,1);assert.equal(badge.badgeUrl,'https://staff-000.github.io/byokit/badges/github-123.svg');assert.equal(badge.profileUrl,'https://github.com/Verifier');assert.ok(badgeMarkdown(badge).includes(badge.recognitionUrl));assert.equal(badge.firstVerifiedAt,'2026-01-01T00:00:00Z');
});
test('failed, local, staging and non-text checks cannot award badges',()=>{
 assert.deepEqual(contributorBadges([record({result:'failed'}),record({scope:'this-browser'}),record({staging:true}),record({checks:['modelList']})]),[]);
});
test('duplicates and renamed contributors retain one stable award; provider offerings count separately',()=>{
 const first=record(),second=record({id:'website:123:report-two',offeringId:'openrouter/test',checkedAt:'2026-01-02T00:00:00Z',contributor:'github:Renamed'});
 const badges=contributorBadges([first,first,second]);assert.equal(badges.length,1);assert.equal(badges[0].verificationCount,2);assert.equal(badges[0].verifiedModels,2);assert.equal(badges[0].login,'Renamed');assert.equal(badges[0].identity,'github-123');
 const delayed=record({id:'website:123:report-three',contributor:'github:Newest',notes:'submitted 2026-01-04T00:00:00Z; Provider call ran in browser.'});assert.equal(contributorBadges([second,delayed])[0].login,'Newest');
});
test('generated SVG contains only safe public text and no external resources or executable markup',()=>{
 const [badge]=contributorBadges([record()]),svg=contributorBadgeSvg(badge);assert.ok(svg.includes('@Verifier'));assert.ok(svg.includes('Model Verifier'));assert.ok(!/<script|onload=|href=|foreignObject/i.test(svg));assert.throws(()=>contributorBadgeSvg({...badge,login:'<script>'}));assert.deepEqual(contributorBadges([record({contributor:'github:../evil'})]),[]);
});
