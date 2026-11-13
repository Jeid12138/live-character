import {PERFORMANCE_RULES} from '../performance-contract.js';
import {readCharacterContext,readCharacterRuntime} from '../character-presets.js';
export const inject=['systemPrompt','tools'];
export const characterContract=PERFORMANCE_RULES;
export function apply(ctx,config={}){
 if(!config.characterId||!config.dataDirectory)throw Error('旧版通用预设没有角色绑定；请在 Live Character 明确重置角色会话，新建独立角色预设。历史未修改。');
 ctx.tools.restrict({allow:[]});
 ctx.systemPrompt.section({name:'live-character-contract',order:100,text:characterContract,complete:true});
 ctx.systemPrompt.context({name:'live-character-character-config',order:110,required:true,text:()=>readCharacterContext(config)});
 ctx.systemPrompt.context({name:'live-character-runtime',order:120,text:()=>readCharacterRuntime(config)});
}
