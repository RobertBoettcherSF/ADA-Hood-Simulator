--  The Standard city plan (40 x 32 blocks): terrain, river, railway,
--  avenues, landmarks, districts, parks and the businesses placed while the
--  plan is built. A port of the 1.2.91 city-plan generator and business
--  placer, with their quirks, driven by the city-plan LCG (Hood.Random).
private package Hood.City.Plan with Preelaborate is

   W : constant := Standard_W;
   H : constant := Standard_H;
   N : constant := W * H;

   subtype Cell is Integer_32 range 0 .. N - 1;

   --  Block content ids of the plan (1.2.91 numbering).
   Shop_Strip       : constant := 0;
   Radio            : constant := 4;
   Power_Plant      : constant := 6;
   Newspaper        : constant := 7;
   Water_Plant      : constant := 8;
   Docks            : constant := 9;
   Plaza            : constant := 10;
   Single_Business  : constant := 11;
   Mixed            : constant := 15;
   Premium          : constant := 16;
   River_V          : constant := 19;
   River_H          : constant := 20;
   River_Down       : constant := 21;
   River_Up         : constant := 22;
   River_Down_Cap   : constant := 23;
   River_Up_Cap     : constant := 24;
   Avenue_H         : constant := 34;
   Avenue_V         : constant := 35;
   Avenue_Crossing  : constant := 36;
   Bridge           : constant := 37;
   Station          : constant := 38;
   Rail             : constant := 39;
   Rail_Bridge      : constant := 40;
   Rail_Over_Avenue : constant := 41;
   City_Hall        : constant := 42;
   Hospital         : constant := 43;
   Police_HQ        : constant := 44;
   Employment       : constant := 45;
   Fire_Dept        : constant := 46;
   US_Post          : constant := 47;
   Museum           : constant := 48;
   Department_Store : constant := 49;
   Bank_Large       : constant := 50;
   Courthouse       : constant := 51;
   Baths            : constant := 52;
   FBI_HQ           : constant := 54;
   Hotel_Large      : constant := 55;
   Orphanage        : constant := 56;
   School           : constant := 57;
   Empty            : constant := 58;
   Church_V_Lower   : constant := 68;
   Church_V_Upper   : constant := 69;
   Church_H         : constant := 70;

   function Is_Park (C : Integer_32) return Boolean is
     (C in 25 .. 33 | 62 .. 67);
   function Is_River (C : Integer_32) return Boolean is (C in 19 .. 24);

   --  Business kinds the placer names (data/tables.json "kinds").
   K_Cab_Company      : constant := 15;
   K_Department_Store : constant := 31;
   K_Bank_Large       : constant := 67;
   K_Hotel_Large      : constant := 68;
   K_Removals         : constant := 95;
   K_Bank             : constant := 102;
   K_Docks            : constant := 124;
   K_Newspaper        : constant := 139;
   K_Radio            : constant := 142;
   K_Residential      : constant := 151;
   K_Soup_Kitchen     : constant := 153;
   K_Tenement         : constant := 170;

   --  The 3 x 3 interior cells of a block, index (row - 1) * 3 + (col - 1).
   type Cell_Use is
     (None, Business, Soup_Kitchen, Lot, Yard, Paving, Tenement, House,
      Under_Rail);
   type Use_Row is array (Integer_32 range 0 .. 8) of Cell_Use;
   type Cell_List is array (Integer_32 range 0 .. 8) of Integer_32;

   type Firm is record
      Kind   : Integer_32;
      Count  : Integer_32;
      Cells  : Cell_List;
      Master : Integer_32;
   end record;

   Max_Firms : constant := 16;  --  per block (proposed; 1.2.91 places at most 9)
   type Firm_List is array (Integer_32 range 0 .. Max_Firms - 1) of Firm;

   type Fill is record
      Present : Boolean;
      Uses    : Use_Row;
      Firms   : Integer_32;
      List    : Firm_List;
   end record;

   type Point is record
      X, Y : Integer_32;
   end record;

   type Park_Rec is record
      X, Y, W, H : Integer_32;
   end record;

   Max_Parks : constant := 8;  --  4 quadrant parks and up to 4 church grounds

   --  Results of Run (row-major, index y * W + x).
   Content    : array (Cell) of Integer_32;
   Land_Value : array (Cell) of Integer_32;
   Fills      : array (Cell) of Fill;
   Park_Count : Integer_32;
   Parks      : array (Integer_32 range 0 .. Max_Parks - 1) of Park_Rec;
   Church_Count : Integer_32;
   Churches   : array (Integer_32 range 0 .. 3) of Point;
   Overflow   : Boolean;  --  Max_Firms was reached

   procedure Run
     (Seed     : Unsigned_32;
      Churches_Wanted : Integer_32;
      Retries  : out Integer_32;
      Ok       : out Boolean)
     with Pre => Churches_Wanted in 0 .. 4;
   --  The plan for Seed; a plan that gets stuck is re-tried with Seed + 1,
   --  up to 16 seeds. As in 1.2.91 the businesses placed by a stuck try
   --  stay (the placer's state is not reset between tries).

   Ignored : Integer_32;
   --  The last value 1.2.91 computes and does not use (a draw that only
   --  advances the generator, or a result the caller drops).

end Hood.City.Plan;
