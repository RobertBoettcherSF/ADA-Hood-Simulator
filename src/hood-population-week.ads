--  The working week (item 4): the clock of five 480-minute days from 8:00,
--  the people's ambient walking, and the week's-end settlement. Ported from
--  1.2.91 (sim.ts tickOnce, endWeekStep; systems/ambient.ts; the wage and
--  loyalty part of systems/economy.ts), written fresh.
--
--  Exact against 1.2.91: every draw of minute 1 (nobody is walking yet, so
--  minute 1 is all destination choices) and the week's-end wages, demands
--  and loyalty. Approximate after minute 1: walkers go in an L along x then
--  y at Walk_Step a minute instead of along 1.2.91's pavement routes, so
--  arrival times, and with them the later draws, differ (checked within
--  +/-20 % of 1.2.91's draws per day until item 6 brings the routes).
with Hood.Random;

package Hood.Population.Week with Preelaborate is

   --  1.2.91 WALK_SPEED is 1.8 m/s at 10/3 minutes a second, 0.54 m a
   --  minute: 138.24 units, kept whole (proposed).
   Walk_Step : constant := 138;

   --  The week's-end stages in 1.2.91's order (sim.ts endWeekStep, DESIGN
   --  5.3). Item 4 carries out Economy (wages and loyalty only),
   --  Succession, End_Conditions and Next_Week; the others are slots kept
   --  for the item that brings them (DESIGN 8).
   type Settlement_Stage is
     (Orders_And_Jobs,     --  item 5
      Economy,             --  item 4: wages, loyalty, desertion; income item 8
      Taxes,               --  item 8
      Audits,              --  item 8
      Law,                 --  item 7
      Fbi,                 --  item 7
      Opinion,             --  item 8
      Territory_Goodwill,  --  item 8
      Politics,            --  item 8
      News,                --  item 8
      Diplomacy,           --  item 9
      Command,             --  item 5
      History,             --  item 8
      Succession,          --  item 4
      Reserved,            --  empty in 1.2.91 too
      End_Conditions,      --  item 4: the player's boss gone; the rest item 8
      Next_Week,           --  item 4: week counter, recruits; the rest items 5-8
      Rival_Planning);     --  item 9

   procedure Launch (S : in out Population_State)
     with Pre => S.Phase = Planning and then not S.Game_Over;

   --  One minute of the week.
   procedure Tick
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
     with Pre => S.Phase = Week_Running
                 and then S.Minute < Minutes_Per_Week;

   --  The week's end, all stages; leaves the phase at Planning.
   procedure Settle
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
     with Pre => S.Phase = Week_Running
                 and then S.Minute = Minutes_Per_Week;

   --  The rest of the week and its end.
   procedure Finish
     (S    : in out Population_State;
      C    : Hood.City.City_State;
      Main : in out Hood.Random.Mulberry)
     with Pre => S.Phase = Week_Running;

   --  A member leaves his gang (economy.ts defect).
   procedure Defect (S : in out Population_State; Person : Integer_32);

end Hood.Population.Week;
