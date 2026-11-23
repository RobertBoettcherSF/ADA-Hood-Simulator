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
   end record;

   type Person_Array is array (Integer_32 range 0 .. Max_People - 1) of Person_Rec;

   type Stance is (Alliance, Peace, Ceasefire, Aggression, War);
   type Stance_Set is array (Gang_Id) of Stance;
   type Member_List is array (1 .. Max_Pool) of Integer_32;
   type Site_List is array (1 .. Max_Sites) of Integer_32;

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
      Manager     : Integer_32;   --  person index
      Team        : Integer_32;   --  the crew's number
      Lieutenant  : Integer_32;   --  person index
      Crew_Count  : Integer_32;
      Crew        : Member_List;
      Pool_Count  : Integer_32;
      Pool        : Member_List;
      Pistols     : Integer_32;   --  in the office
      Coupes      : Integer_32;
      Crew_Pistols : Integer_32;
      Crew_Coupes : Integer_32;
      Offered     : Stance_Set;
      Known       : Stance_Set;
      Site_Count  : Integer_32;
      Sites       : Site_List;    --  starting-racket choices, in order
      Wages       : Integer_32;   --  paid at the last week's end
      Eliminated  : Boolean;
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
   end record;

   type Extra_Array is array (Integer_32 range 0 .. Hood.City.Max_Buildings - 1) of Building_Extra;
   type Count_Array is array (Integer_32 range 0 .. Hood.City.Max_Blocks - 1) of Integer_32;

   type Phase_Kind is (Planning, Week_Running);

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
