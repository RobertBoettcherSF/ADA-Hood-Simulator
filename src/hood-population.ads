--  People, gangs and crews (DESIGN item 4): fixed arrays with counts, in
--  the order 1.2.91 creates them (citygen.ts:539-925). Every person keeps
--  the number 1.2.91 gives it (one counter shared with lots, buildings,
--  offices and crews), because walking spots and attitudes are computed
--  from it.
with Interfaces;
with Hood.City;
with Hood.Tables;
with Hood.Units;

package Hood.Population with Preelaborate is

   use Interfaces;
   use Hood.Tables;

   --  Caps (all proposed). Measured on seed 1932: Standard 8,479 people,
   --  Large 20,879.
   Max_People : constant := 24_576;
   Max_Pool   : constant := 64;   --  gang members waiting in the office
   Max_Sites  : constant := 512;  --  starting-racket choices per gang
   Gang_Count : constant := 4;
   --  Item 5 (all proposed): crews, orders and the week's messages.
   Max_Gang_Crews   : constant := 12;   --  constants.ts MAX_TEAMS
   Max_Crew_Members : constant := 9;    --  MAX_TEAM_SIZE 10, less the lieutenant
   Max_Crews        : constant := Max_Gang_Crews * Gang_Count;
   Max_Crew_Orders  : constant := 24;   --  orders one crew holds in a week
   Max_Orders       : constant := 512;  --  live orders of every gang
   Max_Targets      : constant := 64;   --  sites of one order
   Max_Order_Blocks : constant := 16;
   Max_Results      : constant := 64;   --  result lines of one order
   Max_Messages     : constant := 256;  --  the player's messages of a week

   No_Id : constant := Hood.City.No_Id;

   subtype Gang_Id is Integer_32 range 1 .. Gang_Count;
   subtype Gang_Ref is Integer_32 range 0 .. Gang_Count;  --  0 = none

   --  Loyalty in whole units: 255 units are one percent, so 1.2.91's byte
   --  steps (one byte = 100/255 %) are exact (proposed).
   Loyalty_Per_Percent : constant := 255;
   Loyalty_Full        : constant := 100 * Loyalty_Per_Percent;
   Loyalty_Start       : constant := 70 * Loyalty_Per_Percent;  --  citygen.ts:118
   Loyalty_Byte        : constant := 100;  --  units in one 1.2.91 loyalty byte

   type Status_Kind is (Active, Dead);
   --  Later steps add jailed, beaten, captured and the rest.

   type Skill_Set is array (Skill) of Integer_8;  --  half stars, 1 .. 10
   type Opinion_Set is array (Gang_Id) of Integer_8;

   type Person_Rec is record
      Id        : Integer_32;       --  1.2.91's number for the person
      Kind      : Role;
      Status    : Status_Kind;
      Female    : Boolean;
      Portrait  : Integer_8;        --  0 .. 23
      Skills    : Skill_Set;
      Gang      : Gang_Ref;
      Team      : Integer_32;       --  the crew's number, or No_Id
      Building  : Integer_32;       --  building index, or No_Id
      Pay       : Integer_32;
      Demand    : Integer_32;
      Loyalty   : Integer_32;       --  Loyalty_Per_Percent units
      Hostility : Integer_16;       --  toward his own gang; -1 = as rolled
      Fear      : Integer_16;
      Opinion   : Opinion_Set;
      First     : Integer_16;       --  Name_Id
      Last      : Integer_16;
      Nick      : Integer_16;       --  Name_Id or No_Name
      X, Y      : Hood.Units.Units; --  1/256 m
      DX, DY    : Hood.Units.Units; --  where he is walking to
      Walking   : Boolean;
      Order     : Integer_32;       --  item 5: the order slot he works, or No_Id
   end record;

   type Person_Array is array (Integer_32 range 0 .. Max_People - 1) of Person_Rec;

   type Stance is (Alliance, Peace, Ceasefire, Aggression, War);
   type Stance_Set is array (Gang_Id) of Stance;
   type Member_List is array (1 .. Max_Pool) of Integer_32;
   type Site_List is array (1 .. Max_Sites) of Integer_32;
   type Crew_Slots is array (1 .. Max_Gang_Crews) of Integer_32;

   type Gang_Rec is record
      Colour      : Integer_32;   --  0 red, 1 green, 2 blue, 3 orange
      Surname     : Integer_32;   --  Name_Id
      Heritage    : Heritage_Id;
      Player      : Boolean;
      Profile     : Integer_32;   --  rival profile row, or -1
      Boss        : Integer_32;   --  person index
      Cash        : Integer_32;
      Office      : Integer_32;   --  building index
      Front       : Integer_32;
      Manager     : Integer_32;   --  person index (the front's manager)
      Crew_Total  : Integer_32;   --  item 5: crews, 0 .. Max_Gang_Crews
      Crews       : Crew_Slots;   --  crew slots (S.Crews), oldest first
      Pool_Count  : Integer_32;
      Pool        : Member_List;
      Pistols     : Integer_32;   --  in the office
      Coupes      : Integer_32;
      Offered     : Stance_Set;
      Known       : Stance_Set;
      Site_Count  : Integer_32;
      Sites       : Site_List;    --  starting-racket choices, in order
      Wages       : Integer_32;   --  paid at the last week's end
      Eliminated  : Boolean;
      --  Item 5: this week's purchases and protection taken (finances
      --  opened at the week's end, 1.2.91 stage 16), and last week's.
      Purchases, Protection           : Integer_32;
      Last_Purchases, Last_Protection : Integer_32;
   end record;

   type Gang_Array is array (Gang_Id) of Gang_Rec;

   --  What step 4 adds to a building.
   type Building_Extra is record
      Owner_Gang    : Gang_Ref;
      Owner_Person  : Integer_32;  --  person index, or No_Id
      Manager       : Integer_32;
      Protect_Gang  : Gang_Ref;
      Protect_Weekly : Integer_32;
      Front_Of      : Integer_32;  --  an office: its front's index
      Hides         : Integer_32;  --  a front: its office's index
      Is_HQ         : Boolean;
      Protect_Base  : Integer_32;  --  item 5: the going rate
      Collected_Week : Integer_32; --  item 5: the week it last paid, or 0
   end record;

   type Extra_Array is array (Integer_32 range 0 .. Hood.City.Max_Buildings - 1) of Building_Extra;
   type Count_Array is array (Integer_32 range 0 .. Hood.City.Max_Blocks - 1) of Integer_32;

   type Phase_Kind is (Planning, Week_Running);

   ---------------------------------------------------------------------
   --  Item 5: crews (1.2.91 teams)
   ---------------------------------------------------------------------

   type Crew_Member_List is array (1 .. Max_Crew_Members) of Integer_32;
   type Crew_Order_List is array (1 .. Max_Crew_Orders) of Integer_32;

   type Crew_Rec is record
      Id          : Integer_32;   --  1.2.91's number (the shared counter)
      Gang        : Gang_Ref;     --  0: a free slot
      Lieutenant  : Integer_32;   --  person index
      Name_First  : Integer_32;   --  "First's Crew": the lieutenant's first name then
      Count       : Integer_32;
      Members     : Crew_Member_List;
      Pistols     : Integer_32;
      Coupes      : Integer_32;
      Order_Count : Integer_32;
      Orders      : Crew_Order_List;  --  order slots, in the order given
      Time_Used   : Integer_32;   --  booked man-minutes (crewTime.ts)
   end record;

   type Crew_Array is array (Integer_32 range 0 .. Max_Crews - 1) of Crew_Rec;
   type Crew_Slots_All is array (1 .. Max_Crews) of Integer_32;

   ---------------------------------------------------------------------
   --  Item 5: orders (the peaceful ones)
   ---------------------------------------------------------------------

   type Order_Kind is
     (O_Buy, O_Set_Up, O_Run, O_Collect, O_Adjust, O_Donate, O_Clean_Up,
      O_Clear_Streets, O_Guard, O_Patrol, O_Explore, O_Recruit, O_Go_To);

   type Order_State is
     (Queued, Travelling, Waiting, Executing, Done, Failed, Cancelled);

   --  Why an order failed or what a line says; the page writes the words
   --  (web/src/orders.ts), the core keeps the numbers.
   type Line_Kind is
     (L_None,
      --  results
      L_Bought,            --  A building, B cost
      L_Opened,            --  A type
      L_New_Management,    --  A building
      L_Collected,         --  A building, B amount
      L_Refused_Pay,       --  A building, B owner person or -1
      L_Already_Paid,      --  A building
      L_Protection_Set,    --  A building, B amount
      L_Donated,           --  A building, B amount
      L_Cleaned_Up,        --  A building
      L_Cleared,           --  A building
      L_Looked_Over,       --  A building, B owner gang or 0, C payee gang or 0, D weekly
      L_Found_Hidden,      --  A front, B hidden building
      L_Nobody_Hiring,     --  A building, B elsewhere or -1
      L_Signed_On,         --  B count (to the pool)
      L_Nobody_Willing,
      L_Stood_Guard,       --  A building, B minutes
      L_Patrolled,         --  B blocks, C minutes
      L_Held,              --  B minutes
      L_Ran_Out,
      L_Continuing,        --  A order kind, B people left, C of
      --  fail reasons
      F_No_Site, F_Owned_Already, F_Not_For_Sale, F_Price, F_Not_Yours,
      F_No_Type, F_Illegal_Centre, F_Legal_Centre, F_City_Only, F_No_Front,
      F_Front_Taken, F_Fit_Out, F_Not_Your_Site, F_No_Hood_Free,
      F_No_Charity, F_No_Donation, F_Spare_Money, F_Clean_Up_Money,
      F_Streets_Not_Bribed, F_Site_Gone, F_Nobody_Left,
      F_Never_Started,     --  A wait-reason kind ('Pos), B, C its numbers
      F_Not_Enough_Time, F_Nothing_Came, F_Needs_People, F_Needs_Free,
      F_Target_Lost, F_Never_Started_Default,
      --  messages (report ())
      M_Acquired,          --  A building
      M_Opened,            --  A type
      M_Refused_Protection,--  A building
      M_Uncovered,         --  B hidden building
      M_Order_Failed,      --  A order kind, then the fail line in B .. D
      M_Order_Cut_Short,
      M_Queued_Waiting);   --  A order kind, B reason line

   type Line_Rec is record
      Kind       : Line_Kind;
      A, B, C, D : Integer_32;
   end record;
   No_Line : constant Line_Rec := (L_None, 0, 0, 0, 0);

   type Target_List is array (1 .. Max_Targets) of Integer_32;
   type Block_List is array (1 .. Max_Order_Blocks) of Integer_32;
   type Assigned_List is array (1 .. 10) of Integer_32;
   type Line_List is array (1 .. Max_Results) of Line_Rec;

   type Order_Rec is record
      Id          : Integer_32;   --  1.2.91's number (the shared counter)
      Gang        : Gang_Ref;     --  0: a free slot
      Crew        : Integer_32;   --  crew slot
      Kind        : Order_Kind;
      State       : Order_State;
      Manpower    : Integer_32;
      Repeat      : Boolean;
      Amount      : Integer_32;   --  donate: dollars, -1 none
      Level       : Integer_32;   --  adjust: per cent of the going rate
      Business    : Integer_32;   --  set up: type id, -1 none
      Front       : Integer_32;   --  set up: front building, -1 none
      PX, PY      : Hood.Units.Units;  --  go to: the point
      Has_Point   : Boolean;
      Target_Count : Integer_32;
      Targets     : Target_List;  --  building indexes
      Block_Count : Integer_32;
      Blocks      : Block_List;   --  blocks picked
      Assigned_Count : Integer_32;
      Assigned    : Assigned_List;
      Cursor      : Integer_32;
      Completed   : Integer_32;
      Work_Left   : Integer_64;   --  micro-minutes (Work_Scale)
      Estimate    : Integer_32;   --  minutes
      Worked      : Integer_32;   --  standing orders: minutes on duty, -1 none
      Started     : Integer_32;   --  minute, -1 not yet
      Finished    : Integer_32;   --  minute, -1 not yet
      Crew_Size   : Integer_32;   --  reported crew size, -1 none
      Fail        : Line_Rec;     --  why it failed (or was cut short)
      Last_Miss   : Line_Rec;
      Waiting_For : Line_Rec;     --  dispatch wait reason
      Result_Count : Integer_32;
      Results     : Line_List;
   end record;

   type Order_Array is array (Integer_32 range 0 .. Max_Orders - 1) of Order_Rec;
   type Message_Array is array (1 .. Max_Messages) of Line_Rec;

   Work_Scale : constant := 1_000_000;  --  micro-minutes in a minute

   type Population_State is record
      Count     : Integer_32;
      Next_Id   : Integer_32;   --  1.2.91's shared counter
      Status    : Integer_32;   --  Status_Ok or Status_Full
      People    : Person_Array;
      Gangs     : Gang_Array;
      Extra     : Extra_Array;
      Trading   : Count_Array;  --  trading lots per block
      Phase     : Phase_Kind;
      Week      : Integer_32;
      Minute    : Integer_32;   --  0 .. Minutes_Per_Week
      Game_Over : Boolean;      --  the player's boss is gone
      Rng_After_Setup : Unsigned_32;
      Rng_After_Minute_1 : Unsigned_32;
      Draws_This_Week : Integer_32;
      --  Item 5
      Building_Count : Integer_32;  --  the city's, for loops over Extra
      Crews          : Crew_Array;
      Orders         : Order_Array;
      Last_Count     : Integer_32;  --  last week's finished orders
      Last_Week      : Order_Array; --  copies, as 1.2.91 lastWeekOrders
      Message_Count  : Integer_32;
      Messages       : Message_Array;  --  the player's, this week
      City_Changed   : Boolean;     --  a building or block changed: the page refills its lots
   end record;

   Status_Ok   : constant := 0;
   Status_Full : constant := 1;

   Minutes_Per_Day  : constant := 480;   --  8:00 to 16:00
   Days_Per_Week    : constant := 5;
   Minutes_Per_Week : constant := Minutes_Per_Day * Days_Per_Week;

   --  Names.
   Max_Name : constant := 64;
   function Full_Name_Length (P : Person_Rec) return Integer_32;
   function Full_Name_Char (P : Person_Rec; Index : Integer_32) return Character
     with Pre => Index in 1 .. Full_Name_Length (P);
   --  "First Last", or "First "Nick" Last" for a boss.

   --  Attitudes toward a gang as 1.2.91 rolls them at creation
   --  (attitudes.ts:47-62): from the person's number, not the stream.
   function Rolled_Hostility (Id : Integer_32; Kind : Role; Gang : Gang_Id) return Integer_32;
   function Rolled_Fear (Id : Integer_32; Kind : Role; Gang : Gang_Id) return Integer_32;
   function Hostility_Of (P : Person_Rec; Gang : Gang_Id) return Integer_32;
   function Fear_Of (P : Person_Rec; Gang : Gang_Id) return Integer_32;

   function Wage_Quote (P : Person_Rec; Gang : Gang_Id) return Integer_32;
   --  The weekly asking wage (1.2.91 weekly wage rules).

   function Pay_Demand (P : Person_Rec; As : Role) return Integer_32;
   --  A recruit's demand (citygen.ts:143-151).

   --  Hashes (FNV-1a, four little-endian bytes per value; all proposed).
   function People_Hash (S : Population_State; C : Hood.City.City_State) return Unsigned_32;
   --  Per person in number order: number, role, gang or -1, female,
   --  portrait, eleven skills in half stars, pay, demand, loyalty units,
   --  crew number or -1, rank of the building among live buildings or -1.
   function Position_Hash (S : Population_State) return Unsigned_32;
   --  Per person: number, x and y in 1/256 m.
   function Opinion_Hash (S : Population_State) return Unsigned_32;
   --  Per person: number, opinion of gangs 1 .. 4.
   function Name_Hash (S : Population_State) return Unsigned_32;
   --  Per person: number, name length, then one byte per character.

   function Block_Rect_X (B : Hood.City.Block_Rec) return Integer_32 is (B.GX * 54 + 10);
   function Block_Rect_Y (B : Hood.City.Block_Rec) return Integer_32 is (B.GY * 54 + 10);
   function Block_Rect_W (B : Hood.City.Block_Rec) return Integer_32 is (B.Span_X * 54 - 20);
   function Block_Rect_H (B : Hood.City.Block_Rec) return Integer_32 is (B.Span_Y * 54 - 20);
   --  The block inside its streets: 54 m cells, 14 m streets, 3 m inset
   --  (cityLayout.ts:20-25), in whole metres.

   procedure Pavement (B : Hood.City.Block_Rec; N : Integer_32; X, Y : out Hood.Units.Units);
   --  The spot number N on the pavement round B (cityLayout.ts:36-41).

   function Block_At (C : Hood.City.City_State; GX, GY : Integer_32) return Integer_32;
   --  The block (its merged site if merged) at a grid cell, or No_Id.
   function Has_Footway (C : Hood.City.City_State; B : Integer_32) return Boolean;
   function Live (C : Hood.City.City_State; B : Integer_32) return Boolean is
     (B in 0 .. C.Building_Count - 1 and then not C.Buildings (B).Removed);
   function Class_Of (C : Hood.City.City_State; B : Integer_32) return Building_Class is
     (Type_Class (C.Buildings (B).Kind_Of));

   procedure Count_Trading (S : in out Population_State; C : Hood.City.City_State);
   --  Trading lots per block (every standing building but empty land).

end Hood.Population;
