--  The city: blocks, lots and buildings as fixed arrays with counts
--  (DESIGN 3.2, 3.3), built by Generate in the order 1.2.91 builds them
--  (createWorld, src/sim/citygen.ts:358-538). Two paths, as in 1.2.91:
--  the Standard 40 x 32 city from the city-plan generator (Hood.City.Plan,
--  Hood.City.Standard) and every other size from districts and block
--  modules (Hood.City.Varied).
with Interfaces;
with Hood.Random;
with Hood.Tables;
with Hood.Units;

package Hood.City with Preelaborate is

   use Interfaces;
   use Hood.Tables;

   --  Caps (DESIGN 3.2, all proposed). Measured on seed 1932: Standard
   --  1,280 blocks and 4,580 lots; Large 1,540 blocks and 13,488 lots.
   Max_Blocks    : constant := 1_540;
   Max_Lots      : constant := 18_480;
   Max_Buildings : constant := 18_480;

   No_Id : constant := -1;

   Standard_W : constant := 40;  --  newGameValidation.ts:7
   Standard_H : constant := 32;

   type Block_Use is (Urban, Park, Civic_Site, Plaza, Avenue, Water);
   --  'Pos is the use number in the city hash (proposed order).

   type Block_Rec is record
      GX, GY      : Integer_32;
      Area        : District;
      Land_Value  : Integer_32;  --  0 .. 100
      Squalor     : Integer_32;
      Use_Of      : Block_Use;
      Span_X      : Integer_32;
      Span_Y      : Integer_32;
      Merged_Into : Integer_32;  --  the block this one is part of, or No_Id
      Content     : Integer_32;  --  Standard: the plan content id; else No_Id
      Plan_Value  : Integer_32;  --  Standard: plan land value 0 .. 255
      Rail        : Boolean;     --  under the elevated railway
      Landmark    : Integer_32;  --  type id of a landmark site, or No_Id
      Name        : Integer_32;  --  park or church name number, or No_Id
      Module      : Integer_32;  --  Varied: block module id, or No_Id
      Turn        : Integer_32;  --  Varied: module quarter turns
      Center_X    : Hood.Units.Units;
      Center_Y    : Hood.Units.Units;
      First_Lot   : Integer_32;
      Lots        : Integer_32;
   end record;

   type Lot_Rec is record
      Block       : Integer_32;
      Index       : Integer_32;  --  0 .. 8 interior cell, module plot index
      X, Y, W, H  : Hood.Units.Units;  --  bounds, rounded down to 1/256
      Center_X    : Hood.Units.Units;
      Center_Y    : Hood.Units.Units;
      Face        : Facing;
      Building    : Integer_32;  --  index into Buildings, or No_Id
   end record;

   type Building_Rec is record
      Lot     : Integer_32;
      Block   : Integer_32;
      Kind_Of : Type_Id;
      Trade   : Integer_32;  --  Standard: business kind, or No_Kind
      Removed : Boolean;     --  replaced by a landmark (citygen.ts:503-504)
   end record;

   type Headquarters is record
      Block    : Integer_32;
      Front    : Integer_32;  --  building index of the front
      Front_As : Integer_32;  --  the business kind the front becomes
      FX, FY   : Integer_32;  --  fine cell (5 per block)
   end record;

   type Block_Array is array (Integer_32 range 0 .. Max_Blocks - 1) of Block_Rec;
   type Lot_Array is array (Integer_32 range 0 .. Max_Lots - 1) of Lot_Rec;
   type Building_Array is array (Integer_32 range 0 .. Max_Buildings - 1) of Building_Rec;
   type Headquarters_Array is array (Integer_32 range 1 .. 4) of Headquarters;

   --  Generation status (proposed numbers).
   Status_Ok          : constant := 0;
   Status_Full        : constant := 1;  --  a cap was reached
   Status_Plan_Failed : constant := 2;  --  the plan stuck on all 16 seeds
   Status_No_Site     : constant := 3;  --  no headquarters site

   type Class_Counts is array (Hood.Tables.Building_Class) of Integer_32;

   type City_State is record
      W, H            : Integer_32;
      Standard        : Boolean;
      Status          : Integer_32;
      Industrial_Edge : Integer_32;
      Plan_Retries    : Integer_32;
      Block_Count     : Integer_32;
      Lot_Count       : Integer_32;
      Building_Count  : Integer_32;  --  created, removed ones included
      Blocks          : Block_Array;
      Lots            : Lot_Array;
      Buildings       : Building_Array;
      HQ_Count        : Integer_32;
      HQ              : Headquarters_Array;
      City_Hash       : Unsigned_32;
      Structure_Hash  : Unsigned_32;
      Rng_After_City  : Unsigned_32;
      --  Live buildings by class and types in use as generated, before the
      --  people's setup turns fronts and offices (item 4).
      Built_Class     : Class_Counts;
      Built_Types     : Integer_32;
   end record;

   procedure Generate
     (C      : out City_State;
      Main   : in out Hood.Random.Mulberry;
      Seed   : Unsigned_32;
      W, H   : Integer_32)
     with Pre => W in 8 .. 44 and then H in 8 .. 35;
   --  The city for Seed: Main is the simulation stream right after it was
   --  seeded (citygen.ts:362). 40 x 32 takes the Standard path. Ends where
   --  1.2.91 places people (citygen.ts:539), then the Standard
   --  headquarters (Large: step 4). Hashes and Rng_After_City are taken at
   --  that point.

   function Live_Buildings (C : City_State) return Integer_32;

   function City_Hash (C : City_State) return Unsigned_32;
   --  FNV-1a, four little-endian bytes per value (proposed): every block
   --  (gx, gy, district, land value, squalor, use, span x, span y, merged
   --  into); every lot in creation order (block, index, centre x and y in
   --  1/256, rank of its building or -1); every live building in creation
   --  order (rank of its lot, block, type number or -1 for empty land).

   function Structure_Hash (C : City_State) return Unsigned_32;
   --  The same without positions and spans: blocks (gx, gy, district, land
   --  value, squalor, use, merged into), lots (block, index), buildings
   --  (block, type number).

   --  Helpers shared by the generators.

   procedure Add_Lot
     (C        : in out City_State;
      Block    : Integer_32;
      Index    : Integer_32;
      X, Y     : Long_Float;
      W, H     : Long_Float;
      Face     : Facing;
      Lot      : out Integer_32);
   --  A lot with bounds in 1.2.91 units (floating point, exactly as 1.2.91
   --  computes them); bounds and centre are stored rounded down to 1/256.
   --  Lot is No_Id when the cap is reached.

   procedure Add_Building
     (C       : in out City_State;
      Lot     : Integer_32;
      Kind_Of : Type_Id;
      Trade   : Integer_32;
      B       : out Integer_32);
   --  A building on Lot (it replaces nothing; see Replace_Building).

   procedure Replace_Building
     (C       : in out City_State;
      Lot     : Integer_32;
      Kind_Of : Type_Id;
      B       : out Integer_32);
   --  The lot's building is removed and a new one created on it.

   function To_Units (V : Long_Float) return Hood.Units.Units;
   --  V metres in 1/256, rounded down.

   --  Starting businesses of the Standard city (step 4).
   Max_Starting_Sites : constant := 60;
   type Building_Flags is array (Integer_32 range 0 .. Max_Buildings - 1) of Boolean;
   type Starting_Site_List is array (1 .. Max_Starting_Sites) of Integer_32;

   procedure Starting_Sites
     (C     : City_State;
      Gang  : Integer_32;
      Taken : Building_Flags;
      Sites : out Starting_Site_List;
      Count : out Integer_32)
     with Pre => C.Standard and then Gang in 1 .. 4 and then C.HQ (Gang).Block /= No_Id;
   --  Business and tenement master cells in square-ring order from the
   --  gang's front cell (1.2.91 gang bootstrap): up to 60 buildings
   --  that are not Taken (owned, protected or an office) and not the
   --  gang's own front.

end Hood.City;
