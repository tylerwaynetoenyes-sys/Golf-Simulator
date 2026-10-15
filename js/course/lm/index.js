// Detailed landmark builders, one file each (see kit.js for the contract).
// Entries here take precedence over the simpler builders in ../landmarks.js.
import zoo from './zoo.js';
import delmar from './delmar.js';
import arch from './arch.js';
import riverfront from './riverfront.js';
import riverboat from './riverboat.js';
import piasa from './piasa.js';
import chainofrocks from './chainofrocks.js';
import cahokia from './cahokia.js';
import basilica from './basilica.js';
import citymuseum from './citymuseum.js';
import altonlegends from './altonlegends.js';
import western from './western.js';
import harbor from './harbor.js';
import paris from './paris.js';
import eaststl from './eaststl.js';
import cassis from './cassis.js';
import forestpark from './forestpark.js';
import confluencepoint from './confluencepoint.js';
import gatewayarch from './gatewayarch.js';
import cahokiasite from './cahokiasite.js';
import zoogrounds from './zoogrounds.js';
import backnine from './backnine.js';

const all = { zoo, delmar, arch, riverfront, riverboat, piasa, chainofrocks, cahokia, basilica, citymuseum, altonlegends, forestpark, confluencepoint, gatewayarch, cahokiasite, zoogrounds, ...western, ...harbor, ...paris, ...eaststl, ...cassis, ...backnine };
export const EXTRA = Object.fromEntries(Object.entries(all).filter(([, b]) => typeof b === 'function'));
