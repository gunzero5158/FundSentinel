import type {RuleType} from './domain';
// Configuration starting points, not backtested recommendations. Existing rules are never migrated.
export const RULE_DEFAULTS:Record<RuleType,{threshold:number;activation:number;step:number;buffer:number}>={
 TRAILING_STOP_NAV:{threshold:5,activation:5,step:2,buffer:1},
 TRAILING_STOP_RET:{threshold:5,activation:5,step:2,buffer:1},
 TRAILING_STOP_PROFIT:{threshold:30,activation:5,step:10,buffer:5},
 FIXED_TAKE_PROFIT:{threshold:15,activation:0,step:5,buffer:1},
 FIXED_STOP_LOSS:{threshold:5,activation:0,step:2,buffer:1},
 PORTFOLIO_DD:{threshold:5,activation:0,step:1,buffer:1},
 FUND_STAGE_DD:{threshold:10,activation:0,step:2,buffer:1},
 FUND_HIST_MDD:{threshold:90,activation:0,step:10,buffer:5},
 FUND_DAILY_VOL:{threshold:3,activation:0,step:1,buffer:0.5},
 FUND_DOWN_DAYS:{threshold:5,activation:0,step:1,buffer:0}
};
