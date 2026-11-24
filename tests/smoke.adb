--  Native smoke test (D-027): calls every hs_ export and every Ada unit with
--  contracts on, checks the random numbers against values produced by the
--  TypeScript build 1.2.91 (src/sim/rng.ts run in Node for seed 1932), and
--  prints the values the browser page shows, so the two can be compared.
with Ada.Calendar;
with Ada.Command_Line;
with Ada.Exceptions;
with Ada.Text_IO;
with Interfaces;
with Hood.Grid;
with Hood.Population;
with Hood.Population.Commands;
with Hood.Tables;
with Hood.Host_ABI;
with Hood.Random;
with Hood.Trig;
with Hood.Units;
with Hood.Version;
with Hood.World;

procedure Smoke is

   use Ada.Text_IO;
   use Interfaces;
   use Hood.Host_ABI;
   use type Hood.Units.Units;
   use type Hood.Trig.Angle;

   package Hex_IO is new Modular_IO (Unsigned_32);

   Failures : Natural := 0;

   procedure Check (Ok : Boolean; What : String) is
   begin
      if Ok then
         Put_Line ("ok    " & What);
      else
         Put_Line ("FAIL  " & What);
         Failures := Failures + 1;
      end if;
   end Check;

   ---------------------------------------------------------------------
   --  1.2.91 reference values (typed from the Node run of rng.ts)
   ---------------------------------------------------------------------

   type U32_List is array (Positive range <>) of Unsigned_32;
   type I32_List is array (Positive range <>) of Integer_32;

   Ref_Main : constant U32_List :=
     [2087000994, 1345216982, 2537227108, 2322682548, 3464602834,
      1449177721,  955002386, 2725655775, 3304141253, 1945812103,
      3106597394, 3860522775, 3923203638, 3143742962,  942210133,
       573572034, 4118670652, 2227219457, 2140019606, 4173634592];
   Ref_State_After_20 : constant Unsigned_32 := 2271579824;
   Ref_Seed_0_First   : constant Unsigned_32 := 1541420728;
   Ref_Int : constant I32_List :=
     [48, 31, 59, 54, 80, 33, 22, 63, 76, 45,
      72, 89, 91, 73, 21, 13, 95, 51, 49, 97];
   Ref_Plan : constant I32_List :=
     [ 6347, 31496, 30113, 27735, 13669, 28831, 25076, 12886, 27578, 14561,
      15010, 14895, 11210, 18983,  2483, 24216, 15099,  5001,  1002, 15126];
   Ref_Headquarters : constant I32_List := [25332, 10173, 3571, 2067, 29729];
   Ref_Auto_Week_1  : constant U32_List := [3363666125, 3601843148, 2491938879];
   Ref_Chance_35 : constant I32_List :=
     [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
   Ref_Pick_7    : constant I32_List := [3, 2, 4, 3, 5, 2, 1, 4, 5, 3];
   Ref_Shuffle   : constant I32_List := [7, 9, 6, 1, 2, 8, 4, 10, 3, 5];
   Ref_Weighted  : constant I32_List := [2, 2, 2, 2, 3, 2, 0, 2, 2, 2];
   --  0-based item numbers for weights [3, 0, 5, 2]
   Ref_Strategy_Seed  : constant Unsigned_32 := 21878;       --  runs = 2
   Ref_Strategy_First : constant Unsigned_32 := 3469019532;
   Ref_Explore_Seed   : constant Unsigned_32 := 30800;       --  week 1
   Ref_Explore_First  : constant Unsigned_32 := 1739273263;
   Ref_Rival_Seed     : constant Unsigned_32 := 3098;        --  week 1, id 13
   Ref_Rival_First    : constant Unsigned_32 := 277563166;
   Ref_Hash32_1932    : constant Unsigned_32 := 3032841495;

   function Image (V : Unsigned_32) return String is
      S : constant String := Unsigned_32'Image (V);
   begin
      return S (S'First + 1 .. S'Last);
   end Image;

   function Image (V : Integer_32) return String is
      S : constant String := Integer_32'Image (V);
   begin
      return (if V < 0 then S else S (S'First + 1 .. S'Last));
   end Image;

   function File_Name return String is
      Name : String (1 .. Integer (Error_File_Length));
   begin
      for I in Name'Range loop
         Name (I) := Character'Val (Error_File_Char (Integer_32 (I)));
      end loop;
      return Name;
   end File_Name;

   --  Prints Label and the values; counts how many equal the reference.
   procedure Compare_U32 (Label : String; Got, Ref : U32_List) is
      Same : Natural := 0;
   begin
      Put (Label & ":");
      for I in Got'Range loop
         Put (" " & Image (Got (I)));
         if Got (I) = Ref (I) then
            Same := Same + 1;
         end if;
      end loop;
      New_Line;
      Check (Same = Ref'Length, Label & Natural'Image (Same) & "/" & Image (Integer_32 (Ref'Length))
             & " match 1.2.91");
   end Compare_U32;

   procedure Compare_I32 (Label : String; Got, Ref : I32_List) is
      Same : Natural := 0;
   begin
      Put (Label & ":");
      for I in Got'Range loop
         Put (" " & Image (Got (I)));
         if Got (I) = Ref (I) then
            Same := Same + 1;
         end if;
      end loop;
      New_Line;
      Check (Same = Ref'Length, Label & Natural'Image (Same) & "/" & Image (Integer_32 (Ref'Length))
             & " match 1.2.91");
   end Compare_I32;

   procedure Random_Checks is
      use Hood.Random;
      G : Mulberry;
      P : Plan_Lcg;
      U : Unsigned_32;
      V : Integer_32;
      B : Boolean;
      W : Positive;
      Main_Got  : U32_List (1 .. 20);
      Int_Got   : I32_List (1 .. 20);
      Plan_Got  : I32_List (1 .. 20);
      HQ_Got    : I32_List (1 .. 5);
      Auto_Got  : U32_List (1 .. 3);
      Ch_Got    : I32_List (1 .. 20);
      Pick_Got  : I32_List (1 .. 10);
      Wt_Got    : I32_List (1 .. 10);
      Deck      : Index_List := [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      Weights   : constant Weight_List := [3, 0, 5, 2];
   begin
      --  Through the exports (what the page shows) ...
      for I in 1 .. 20 loop
         Main_Got (I) := Rng_Value (Stream_Main, Integer_32 (I));
         Int_Got (I)  := Integer_32 (Rng_Value (Stream_Int, Integer_32 (I)));
         Plan_Got (I) := Integer_32 (Rng_Value (Stream_Plan, Integer_32 (I)));
      end loop;
      Compare_U32 ("mulberry32 seed 1932", Main_Got, Ref_Main);
      Compare_I32 ("int (0, 99) seed 1932", Int_Got, Ref_Int);
      Compare_I32 ("city-plan LCG seed 1932", Plan_Got, Ref_Plan);
      Check (Rng_Value (4, 1) = 0 and then Rng_Value (Stream_Main, 0) = 0,
             "hs_rng_value is 0 for an unknown stream or index");

      --  ... and directly.
      G := Seeded (1932);
      for I in 1 .. 20 loop
         Next (G, U);
      end loop;
      Check (State (G) = Ref_State_After_20,
             "mulberry32 state after 20 draws = " & Image (State (G)));
      G := Seeded (0);
      Next (G, U);
      Check (U = Ref_Seed_0_First, "seed 0 first value = " & Image (U));

      G := Seeded (1932);
      Int (G, 5, 5, V);
      Check (V = 5, "int (5, 5) = 5");
      Int (G, 7, 3, V);
      Check (V = 7, "int (7, 3) = 7 without a draw");
      Next (G, U);
      Check (U = Ref_Main (2), "the next value is the 2nd of the stream");

      P := Plan_Seeded (Headquarters_Seed (1932));
      for I in HQ_Got'Range loop
         Plan_Next (P, HQ_Got (I));
      end loop;
      Compare_I32 ("headquarters LCG", HQ_Got, Ref_Headquarters);

      G := Seeded (Auto_Week_Seed (1932, 1));
      for I in Auto_Got'Range loop
         Next (G, Auto_Got (I));
      end loop;
      Compare_U32 ("Auto week 1 stream", Auto_Got, Ref_Auto_Week_1);

      G := Seeded (1932);
      for I in Ch_Got'Range loop
         Chance (G, 35, 100, B);
         Ch_Got (I) := (if B then 1 else 0);
      end loop;
      Compare_I32 ("chance (35/100)", Ch_Got, Ref_Chance_35);

      G := Seeded (1932);
      for I in Pick_Got'Range loop
         Pick_Index (G, 7, Pick_Got (I));
      end loop;
      Compare_I32 ("pick of 7", Pick_Got, Ref_Pick_7);

      G := Seeded (1932);
      Shuffle (G, Deck);
      Compare_I32 ("shuffle 1 .. 10", I32_List (Deck), Ref_Shuffle);

      G := Seeded (1932);
      for I in Wt_Got'Range loop
         Weighted (G, Weights, W);
         Wt_Got (I) := Integer_32 (W - Weights'First);
      end loop;
      Compare_I32 ("weighted [3, 0, 5, 2]", Wt_Got, Ref_Weighted);

      G := Seeded (1932);
      Weighted (G, [0, -1], W);
      Check (W = 1 and then State (G) = 1932, "weighted with no positive weight: first, no draw");

      Check (Strategy_Seed (1932, 2) = Ref_Strategy_Seed, "strategy seed");
      G := Seeded (Strategy_Seed (1932, 2));
      Next (G, U);
      Check (U = Ref_Strategy_First, "strategy stream first value");
      Check (Explore_Seed (1932, 1) = Ref_Explore_Seed, "explore seed");
      G := Seeded (Explore_Seed (1932, 1));
      Next (G, U);
      Check (U = Ref_Explore_First, "explore stream first value");
      Check (Rival_Week_Seed (1932, 1, 13) = Ref_Rival_Seed, "rival week seed");
      G := Seeded (Rival_Week_Seed (1932, 1, 13));
      Next (G, U);
      Check (U = Ref_Rival_First, "rival stream first value");
      Check (City_Plan_Seed (1932, 1) = 1933, "city-plan retry seed");
      Check (Hash32 (1932) = Ref_Hash32_1932 and then Hash32 (0) = 0, "hash32");
   end Random_Checks;

   procedure Number_Checks is
      use Hood.Units;
      Expected : constant I32_List := [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500];
      Swept    : Natural := 0;
      N        : Unsigned_64 := 0;
   begin
      Put ("hs_check_value 1 .." & Natural'Image (Check_Count) & ":");
      for Id in 1 .. Check_Count loop
         Put (" " & Image (Check_Value (Integer_32 (Id))));
      end loop;
      New_Line;
      for Id in 1 .. Check_Count loop
         Check (Check_Value (Integer_32 (Id)) = Expected (Id),
                "check" & Natural'Image (Id) & " = " & Image (Expected (Id)));
      end loop;
      Check (Check_Value (0) = 0 and then Check_Value (Check_Count + 1) = 0, "unknown check ids give 0");

      --  Isqrt: the contract runs on every call (-gnata).
      while N < 2**62 loop
         Swept := Swept + Natural (Isqrt (N) mod 2);
         N := N * 3 + 1;
      end loop;
      for K in Unsigned_64'(0) .. 100_000 loop
         Swept := Swept + Natural (Isqrt (K) mod 2);
      end loop;
      Check (Isqrt (2**62) = 2**31 and then Isqrt (99) = 9 and then Isqrt (100) = 10,
             "isqrt contract on a sweep of values");
      Check (Swept > 0, "isqrt sweep ran");
      Check (Floor_Div (-7, 2) = -4 and then Floor_Div (7, 2) = 3 and then Floor_Div (-6, 2) = -3,
             "floor division");
      Check (Ratio (-54, 5) = -2765, "negative ratio rounds down");
      Check (Distance (Whole (-3), Whole (4)) = Whole (5), "distance (-3, 4) = 5");
   end Number_Checks;

   procedure Trig_Checks is
      use Hood.Trig;
      Worst_Sum  : Integer_64 := 0;
      Worst_Back : Integer_32 := 0;
      S, C       : Integer_64;
      Back       : Angle;
      Diff       : Integer_32;
   begin
      for A in Angle loop
         S := Integer_64 (Sin (A));
         C := Integer_64 (Cos (A));
         Worst_Sum := Integer_64'Max (Worst_Sum, abs (S * S + C * C - One * One));
         Back := Atan2 (Hood.Units.Units (S), Hood.Units.Units (C));
         Diff := Integer_32 (Back - A);
         Diff := Integer_32'Min (Diff, Steps - Diff);
         Worst_Back := Integer_32'Max (Worst_Back, Diff);
      end loop;
      Put_Line ("trig: worst |sin^2 + cos^2 - 1| =" & Integer_64'Image (Worst_Sum)
                & " / 2^32, worst atan2 round trip =" & Integer_32'Image (Worst_Back) & " step");
      --  Each table value is off by at most 1/2, so s^2 + c^2 is off by at
      --  most |s| + |c| + 1/2 <= sqrt 2 * 65536 + 1/2 < 92_683.
      Check (Worst_Sum < 92_683, "sin^2 + cos^2 within rounding for all 1024 angles");
      Check (Worst_Back <= 1, "atan2 inverts sin/cos within one step for all 1024 angles");
      Check (Sin (0) = 0 and then Sin (Quarter_Turn) = One and then Sin (Half_Turn) = 0
             and then Sin (Half_Turn + Quarter_Turn) = -One, "sine at the quarter turns");
      Check (Atan2 (0, 0) = 0 and then Atan2 (1, 0) = Quarter_Turn
             and then Atan2 (0, -1) = Half_Turn and then Atan2 (-1, 0) = Half_Turn + Quarter_Turn,
             "atan2 on the axes");
   end Trig_Checks;

   procedure Grid_Checks is
      use Hood.Grid;
      Center    : Integer_64;
      In_Block  : Boolean;
      Pitch_Ok  : Boolean := True;
      Cells_Ok  : Boolean := True;
      Kind      : Integer_32;
   begin
      --  Of each block's five cells, a cell is block when its centre lies
      --  between the street edges (7 and 47 units from the block line).
      for I in 0 .. 4 loop
         Center := Integer_64 (2 * I + 1) * Pitch / 10;
         In_Block := Center >= Street_Half and then Center < Street_Half + Block_Size;
         Pitch_Ok := Pitch_Ok and then (Kind_In_Pitch (Integer_32 (I)) = Block) = In_Block;
      end loop;
      Check (Pitch_Ok, "cell kinds follow the street edges (cells 1-3 block, 0 and 4 street)");
      Check (Grid_W = 220 and then Grid_H = 175, "grid 220 x 175 for the Large city");
      for X in 0 .. Grid_W - 1 loop
         for Y in 0 .. Grid_H - 1 loop
            Kind := Hood.Host_ABI.Cell_Kind (X, Y);
            Cells_Ok := Cells_Ok and then Kind =
              (if Kind_In_Pitch (X) = Block and then Kind_In_Pitch (Y) = Block then 1 else 0);
         end loop;
      end loop;
      Check (Cells_Ok, "every one of the 38,500 cells has the right kind");
      Check (Hood.Host_ABI.Cell_Kind (-1, 0) = -1 and then Hood.Host_ABI.Cell_Kind (0, 175) = -1, "outside the grid gives -1");
      Check (Cell_Of (Hood.Units.Whole (54) - 1) = 4 and then Cell_Of (Hood.Units.Ratio (54, 5)) = 0
             and then Cell_Of (Hood.Units.Whole (-1)) = -1, "cell of a position");
   end Grid_Checks;

   ---------------------------------------------------------------------
   --  The city (step 3): references from 1.2.91's createWorld run in
   --  Node up to citygen.ts:539, hashed as Hood.City.City_Hash describes;
   --  the Standard headquarters blocks from the finished 1.2.91 world.
   ---------------------------------------------------------------------

   type City_Ref is record
      W, H       : Integer_32;
      Seed       : Unsigned_32;
      Rng_After  : Unsigned_32;
      City, Structure : Unsigned_32;
      Blocks, Merged, Lots, Buildings, Types_Used : Integer_32;
      Classes    : I32_List (1 .. 8);  --  Building_Class order
      Districts  : I32_List (1 .. 5);  --  District order
      Uses       : I32_List (1 .. 6);  --  Block_Use order
      HQ         : I32_List (1 .. 8);  --  gx, gy of gangs 1 .. 4; Standard only
   end record;

   No_HQ : constant I32_List (1 .. 8) := [others => -1];

   City_Refs : constant array (1 .. 4) of City_Ref :=
     [(36, 28, 1932, 787968811, 130389902, 2172434479, 1008, 140, 8769, 8769, 164,
       [966, 0, 4093, 3091, 359, 257, 3, 0], [63, 269, 56, 534, 86],
       [988, 8, 12, 0, 0, 0], No_HQ),
      (40, 32, 1932, 1183664769, 162525796, 3010893233, 1280, 22, 4580, 4580, 170,
       [719, 1918, 490, 1377, 44, 20, 12, 0], [13, 200, 52, 989, 26],
       [899, 24, 31, 10, 272, 44], [13, 10, 31, 4, 7, 20, 36, 25]),
      (44, 35, 1932, 214220379, 1231309806, 2436981367, 1540, 209, 13488, 13488, 166,
       [1460, 0, 6507, 4651, 452, 415, 3, 0], [94, 415, 69, 838, 124],
       [1520, 8, 12, 0, 0, 0], No_HQ),
      --  A seed whose first city plan gets stuck (one retry).
      (40, 32, 187, 1183663024, 2335500783, 2753879728, 1280, 20, 4733, 4733, 170,
       [755, 1781, 440, 1675, 44, 20, 18, 0], [13, 247, 57, 936, 27],
       [900, 22, 31, 15, 272, 40], [11, 9, 29, 4, 9, 17, 25, 23])];

   procedure City_Checks is
      Rng : Unsigned_32;
   begin
      for R of City_Refs loop
         New_Game (R.Seed, 1932, R.W, R.H);
         Rng := Unsigned_32 (City_Count (Count_Rng_Low))
           or Shift_Left (Unsigned_32 (City_Count (Count_Rng_High)), 16);
         declare
            Label : constant String :=
              Image (R.W) & "x" & Image (R.H) & " seed " & Image (R.Seed);
            Classes_Ok, Districts_Ok, Uses_Ok, HQ_Ok : Boolean := True;
         begin
            Put ("city " & Label & ": rng " & Image (Rng) & " city " & Image (City_Hash)
                 & " structure " & Image (Structure_Hash)
                 & " blocks " & Image (City_Count (Count_Blocks))
                 & " merged " & Image (City_Count (Count_Merged))
                 & " lots " & Image (City_Count (Count_Lots))
                 & " buildings " & Image (City_Count (Count_Buildings))
                 & " types " & Image (City_Count (Count_Built_Types))
                 & " retries " & Image (City_Count (Count_Retries))
                 & " hq");
            for G in Integer_32 range 1 .. City_Count (Count_HQ) loop
               Put (" " & Image (City_Get (Table_Block, City_Get (Table_HQ, G, F_HQ_Block), F_GX))
                    & "," & Image (City_Get (Table_Block, City_Get (Table_HQ, G, F_HQ_Block), F_GY)));
            end loop;
            New_Line;
            Check (City_Count (Count_Status) = 0, Label & ": generated without a stop");
            Check (Rng = R.Rng_After, Label & ": random-number state after the city matches 1.2.91");
            Check (City_Hash = R.City, Label & ": city hash matches 1.2.91");
            Check (Structure_Hash = R.Structure, Label & ": structure hash matches 1.2.91");
            Check (City_Count (Count_Blocks) = R.Blocks and then City_Count (Count_Merged) = R.Merged
                   and then City_Count (Count_Lots) = R.Lots
                   and then City_Count (Count_Buildings) = R.Buildings
                   and then City_Count (Count_Built_Types) = R.Types_Used,
                   Label & ": blocks, merged, lots, buildings, types used match 1.2.91");
            for K in R.Classes'Range loop
               Classes_Ok := Classes_Ok and then
                 City_Count (Count_Built_Class + Integer_32 (K) - 1) = R.Classes (K);
            end loop;
            for K in R.Districts'Range loop
               Districts_Ok := Districts_Ok and then
                 City_Count (Count_District + Integer_32 (K) - 1) = R.Districts (K);
            end loop;
            for K in R.Uses'Range loop
               Uses_Ok := Uses_Ok and then
                 City_Count (Count_Use + Integer_32 (K) - 1) = R.Uses (K);
            end loop;
            Check (Classes_Ok and then Districts_Ok and then Uses_Ok,
                   Label & ": buildings by class, blocks by district and use match 1.2.91");
            if R.HQ (1) >= 0 then
               HQ_Ok := City_Count (Count_HQ) = 4;
               for G in Integer_32 range 1 .. 4 loop
                  HQ_Ok := HQ_Ok
                    and then City_Get (Table_Block, City_Get (Table_HQ, G, F_HQ_Block), F_GX) = R.HQ (Positive (2 * G - 1))
                    and then City_Get (Table_Block, City_Get (Table_HQ, G, F_HQ_Block), F_GY) = R.HQ (Positive (2 * G));
               end loop;
               Check (HQ_Ok, Label & ": headquarters blocks match 1.2.91");
            else
               Check (City_Count (Count_HQ) = 4, Label & ": headquarters placed with the gangs (item 4)");
            end if;
         end;
      end loop;
      --  The draw layers agree with the tables.
      New_Game (1932, 1932, 40, 32);
      Check (Draw_Len (Layer_Blocks) = 1280 * Block_Stride
             and then Draw_Len (Layer_Lots) = 4580 * Lot_Stride
             and then Draw_Len (Layer_People) = 8479 * People_Stride
             and then Draw_Len (9) = 0 and then Draw_Ptr (9) = 0
             and then Draw_Ptr (Layer_Blocks) /= 0 and then Draw_Ptr (Layer_Lots) /= 0,
             "hs_draw_len/hs_draw_ptr for both layers");
      Check (City_Get (Table_Lot, 0, F_Lot_Block) >= 0 and then City_Get (Table_Lot, 4580, F_Lot_Block) = 0
             and then City_Get (99, 0, 0) = 0 and then City_Count (999) = 0,
             "hs_get/hs_count outside their tables give 0");
      New_Game (1932, 1932, 44, 35);  --  the Large world the later checks use
   end City_Checks;

   ---------------------------------------------------------------------
   --  People and the week (item 4): references from 1.2.91's Sim for
   --  seed 1932 (Standard 40 x 32; Large 44 x 35 varied), rival planning
   --  off, as the item covers no orders. Hashes as Hood.Population
   --  describes; the member hash is FNV-1a over gangs 1 .. 4, each man
   --  (boss, lieutenant, crew, pool) as number, pay, demand, loyalty units.
   ---------------------------------------------------------------------

   type People_Ref is record
      W, H        : Integer_32;
      People, Min_Id, Next_Id : Integer_32;
      Rng_Setup   : Unsigned_32;
      Hashes      : U32_List (1 .. 4);  --  people, positions, opinions, names
      Rng_M1      : Unsigned_32;
      Draws_M1    : Integer_32;
      Roles       : I32_List (1 .. 18);  --  Role order
      Wages       : I32_List (1 .. 4);
      Members     : U32_List (1 .. 3);   --  after weeks 1, 2, 3
      Week_Draws  : I32_List (1 .. 3);
      Day_Draws   : I32_List (1 .. 15);
   end record;

   People_Refs : constant array (1 .. 2) of People_Ref :=
     [(40, 32, 8479, 9161, 17648, 532198006,
       [762905189, 59061474, 867735307, 2325457386], 3184470837, 45923,
       [4, 4, 100, 13, 13, 6000, 1911, 400, 0, 1, 5, 1, 4, 4, 1, 12, 3, 3],
       [836, 811, 751, 881], [1873473533, 3343565553, 1526196705],
       [254050, 229972, 228697],
       [70114, 46838, 45305, 46363, 45430, 46512, 45611, 45824, 45809, 46216,
        45229, 46068, 45645, 45901, 45854]),
      (44, 35, 20879, 27006, 47893, 3696518514,
       [4085821087, 1945027344, 3513816520, 825993883], 2775660613, 46247,
       [4, 4, 1010, 244, 273, 7219, 11610, 481, 0, 1, 5, 1, 4, 4, 1, 12, 3, 3],
       [850, 850, 873, 784], [2126860417, 2579826917, 2057194409],
       [242850, 214840, 214181],
       [68277, 45502, 42037, 43956, 43078, 42807, 43126, 42885, 43239, 42783,
        43419, 42664, 42626, 42902, 42570])];

   function Within_20 (Got, Ref : Integer_32) return Boolean is
     (5 * abs (Integer_64 (Got) - Integer_64 (Ref)) <= Integer_64 (Ref));

   function Percent (Got, Ref : Integer_32) return String is
     (Image (Integer_32 ((Integer_64 (Got) - Integer_64 (Ref)) * 1000 / Integer_64 (Ref))) & " per mille");

   function Member_Hash return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
      procedure Add (V : Integer_32) is
         U : constant Unsigned_32 := Unsigned_32 (Integer_64 (V) mod 2**32);
      begin
         for Byte in 0 .. 3 loop
            H := (H xor (Shift_Right (U, 8 * Byte) and 16#FF#)) * 16#0100_0193#;
         end loop;
      end Add;
      procedure Man (P : Integer_32) is
      begin
         if P >= 0 then
            Add (City_Get (Table_Person, P, F_P_Id));
            Add (City_Get (Table_Person, P, F_P_Pay));
            Add (City_Get (Table_Person, P, F_P_Demand));
            Add (City_Get (Table_Person, P, F_P_Loyalty));
         end if;
      end Man;
   begin
      for G in Integer_32 range 1 .. 4 loop
         Man (City_Get (Table_Gang, G, F_G_Boss));
         Man (City_Get (Table_Gang, G, F_G_Lieutenant));
         for K in 1 .. City_Get (Table_Gang, G, F_G_Crew_Count) loop
            Man (City_Get (Table_Crew, G, K));
         end loop;
         for K in 1 .. City_Get (Table_Gang, G, F_G_Pool_Count) loop
            Man (City_Get (Table_Pool, G, K));
         end loop;
      end loop;
      return H;
   end Member_Hash;

   function Joined (Low, High : Integer_32) return Unsigned_32 is
     (Unsigned_32 (Low) or Shift_Left (Unsigned_32 (High), 16));

   procedure People_Checks is
      use type Ada.Calendar.Time;
      Ran : Integer_32;
   begin
      for R of People_Refs loop
         New_Game (1932, 1932, R.W, R.H);
         declare
            Label : constant String := Image (R.W) & "x" & Image (R.H) & " seed 1932";
            Got_Hashes : U32_List (1 .. 4);
            Got_Roles  : I32_List (1 .. 18);
            Wages_Ok, Days_Ok, Text_Ok : Boolean := True;
            T0 : Ada.Calendar.Time;
            Before : Integer_32;
         begin
            for K in Got_Hashes'Range loop
               Got_Hashes (K) := Population_Hash (Integer_32 (K));
            end loop;
            for K in Got_Roles'Range loop
               Got_Roles (K) := City_Count (Count_Role + Integer_32 (K) - 1);
            end loop;
            Put_Line ("people " & Label & ": " & Image (City_Count (Count_People)) & " first "
                      & Image (City_Get (Table_Person, 0, F_P_Id)) & " next "
                      & Image (City_Count (Count_Next_Id)) & " rng "
                      & Image (Joined (City_Count (Count_Setup_Low), City_Count (Count_Setup_High))));
            Check (City_Count (Count_Pop_Status) = 0, Label & ": people placed without a stop");
            Check (City_Count (Count_People) = R.People
                   and then City_Get (Table_Person, 0, F_P_Id) = R.Min_Id
                   and then City_Count (Count_Next_Id) = R.Next_Id,
                   Label & ": people count, first and next number match 1.2.91");
            Compare_I32 (Label & " people by role", Got_Roles, R.Roles);
            Check (Joined (City_Count (Count_Setup_Low), City_Count (Count_Setup_High)) = R.Rng_Setup,
                   Label & ": random-number state after setup matches 1.2.91");
            Compare_U32 (Label & " people/position/opinion/name hashes", Got_Hashes, R.Hashes);
            for K in 1 .. City_Count (Count_People) - 1 loop
               Text_Ok := Text_Ok and then City_Get (Table_Person, K, F_P_Name_Length) > 0
                 and then Name_Char (K, 1) in Character'Pos ('A') .. Character'Pos ('Z');
            end loop;
            Check (Text_Ok and then Name_Char (0, 0) = 0 and then Name_Char (-1, 1) = 0,
                   Label & ": every name starts with a capital; hs_name_char 0 outside");
            for Week in 1 .. 3 loop
               T0 := Ada.Calendar.Clock;
               Launch_Week;
               Check (City_Count (Count_Phase) = 1 and then City_Count (Count_Minute) = 0,
                      Label & " week" & Week'Image & ": launched");
               for Day in 1 .. 5 loop
                  Before := City_Count (Count_Draws_Week);
                  if Week = 1 and then Day = 1 then
                     Ran := Tick (1);
                     Check (Ran = 1 and then Joined (City_Count (Count_M1_Low), City_Count (Count_M1_High)) = R.Rng_M1
                            and then City_Count (Count_Draws_Week) = R.Draws_M1
                            and then Population_Hash (2) = R.Hashes (2),
                            Label & ": random-number state, draws and positions after minute 1 match 1.2.91");
                     Ran := Tick (Hood.Population.Minutes_Per_Day - 1);
                  else
                     Ran := Tick (Hood.Population.Minutes_Per_Day);
                  end if;
                  declare
                     Got : constant Integer_32 := City_Count (Count_Draws_Week) - Before;
                     Ref : constant Integer_32 := R.Day_Draws ((Week - 1) * 5 + Day);
                  begin
                     Days_Ok := Days_Ok and then Within_20 (Got, Ref);
                     Put_Line ("  " & Label & " week" & Week'Image & " day" & Day'Image & " draws "
                               & Image (Got) & " (1.2.91 " & Image (Ref) & ", " & Percent (Got, Ref) & ")");
                  end;
               end loop;
               Check (City_Count (Count_Week) = Integer_32 (Week) + 1 and then City_Count (Count_Phase) = 0,
                      Label & " week" & Week'Image & ": settled, week counter advanced");
               Put_Line ("  " & Label & " week" & Week'Image & " ran in"
                         & Integer'Image (Integer (1000.0 * (Ada.Calendar.Clock - T0))) & " ms (native, contracts on)");
               Check (Within_20 (City_Count (Count_Draws_Week), R.Week_Draws (Week)),
                      Label & " week" & Week'Image & ": walking draws " & Image (City_Count (Count_Draws_Week))
                      & " within 20 % of 1.2.91's " & Image (R.Week_Draws (Week))
                      & " (" & Percent (City_Count (Count_Draws_Week), R.Week_Draws (Week)) & ")");
               Wages_Ok := True;
               for G in Integer_32 range 1 .. 4 loop
                  Wages_Ok := Wages_Ok and then City_Get (Table_Gang, G, F_G_Wages) = R.Wages (Positive (G));
               end loop;
               Check (Wages_Ok, Label & " week" & Week'Image & ": wages of the four gangs match 1.2.91");
               Check (Member_Hash = R.Members (Week),
                      Label & " week" & Week'Image & ": every member's pay, demand and loyalty match 1.2.91 ("
                      & Image (Member_Hash) & ")");
               Check (City_Count (Count_People) = R.People,
                      Label & " week" & Week'Image & ": nobody joined or left (as in 1.2.91)");
            end loop;
            Check (Days_Ok, Label & ": walking draws of every day within 20 % of 1.2.91");
         end;
      end loop;
      --  Finish week runs the rest of a week at once.
      New_Game (1932, 1932, 40, 32);
      Launch_Week;
      Ran := Tick (10);
      Finish_Week;
      Check (Ran = 10 and then City_Count (Count_Week) = 2 and then City_Count (Count_Phase) = 0
             and then Member_Hash = People_Refs (1).Members (1),
             "hs_finish_week settles the same week as minute by minute");
      Check (Tick (5) = 0, "hs_tick does nothing between weeks");
      Check (City_Get (Table_Premises, City_Get (Table_Gang, 1, F_G_Office), F_Pr_HQ) = 1
             and then City_Get (Table_Premises, City_Get (Table_Gang, 1, F_G_Office), F_Pr_Owner_Gang) = 1,
             "the player's office is his headquarters");
      New_Game (1932, 1932, 44, 35);
   end People_Checks;


   --  Item 5: the scripted four weeks of the private 1.2.91 run (seed 1932,
   --  Standard city). Numbers here; the texts in tests/order-check.mjs.
   procedure Order_Checks is
      use Hood.Population;
      use Hood.Population.Commands;
      G, Crew, Lt, Office : Integer_32;
      T0 : Ada.Calendar.Time;
      use type Ada.Calendar.Time;

      function Name (P : Integer_32) return String is
         L : constant Integer_32 := City_Get (Table_Person, P, F_P_Name_Length);
         S : String (1 .. Integer (Integer_32'Max (0, L)));
      begin
         for K in S'Range loop
            S (K) := Character'Val (Name_Char (P, Integer_32 (K)));
         end loop;
         return S;
      end Name;

      --  1.2.91 numbers its live buildings in order; the Ada city keeps the
      --  ones replaced by landmarks, so the n-th live one.
      function Site (Rank : Integer_32) return Integer_32 is
         N : Integer_32 := -1;
      begin
         for B in Integer_32 range 0 .. Hood.Population.Max_Orders * 64 loop
            if City_Get (Table_Building, B, F_B_Removed) = 0 then
               N := N + 1;
               if N = Rank then
                  return B;
               end if;
            end if;
         end loop;
         return -1;
      end Site;

      function Kind_Of (K : Order_Kind) return Integer_32 is (Order_Kind'Pos (K));
      function LK (K : Line_Kind) return Integer_32 is (Line_Kind'Pos (K));
      function YK (K : Reply_Kind) return Integer_32 is (Reply_Kind'Pos (K));

      --  The newest order slot of a kind (this week).
      function Slot_Of (K : Order_Kind) return Integer_32 is
         Best : Integer_32 := -1;
      begin
         for S in Integer_32 range 0 .. Max_Orders - 1 loop
            if City_Get (Table_Order, S, F_O_Gang) = G and then City_Get (Table_Order, S, F_O_Kind) = Kind_Of (K)
              and then (Best < 0 or else City_Get (Table_Order, S, F_O_Id) > City_Get (Table_Order, Best, F_O_Id))
            then
               Best := S;
            end if;
         end loop;
         return Best;
      end Slot_Of;

      function Last_Of (K : Order_Kind) return Integer_32 is
      begin
         for I in 0 .. City_Count (Count_Last) - 1 loop
            if City_Get (Table_Last, I, F_O_Gang) = G and then City_Get (Table_Last, I, F_O_Kind) = Kind_Of (K) then
               return I;
            end if;
         end loop;
         return -1;
      end Last_Of;

      function Result (I, K, F : Integer_32) return Integer_32 is
        (City_Get (Table_Last, I, F_O_Result + 5 * (K - 1) + F));

      procedure Issue_It (Kind : Order_Kind; Men : Integer_32; Label : String;
                          Est : Integer_32; Want : Reply_Kind := Y_Accepted)
      is
         pragma Unreferenced (Kind, Men);
         Ok_Preview : constant Integer_32 := Order_Preview;
         E : constant Integer_32 := City_Get (Table_Preview, 0, F_O_Estimate);
         Got : Integer_32;
      begin
         Got := Order_Issue;
         Put_Line ("  order " & Label & ": reply" & Got'Image & " (" & Reply_Get (1)'Image & Reply_Get (2)'Image
                   & ") estimate" & E'Image & (if Est > 0 then " (1.2.91 preview" & Est'Image & ")" else ""));
         Check (Ok_Preview = 1 and then Got = YK (Want),
                "orders: " & Label & " gives reply " & Reply_Kind'Image (Want));
         if Est > 0 then
            Check (E = Est, "orders: " & Label & " estimate" & E'Image & " = 1.2.91's preview" & Est'Image);
         end if;
      end Issue_It;

      procedure Week_Run (N : Integer; Ref_Draws : Integer_32; Cash : Integer_32) is
      begin
         T0 := Ada.Calendar.Clock;
         Finish_Week;
         Put_Line ("  week" & N'Image & ": cash" & City_Get (Table_Gang, G, F_G_Cash)'Image & " wages"
                   & City_Get (Table_Gang, G, F_G_Wages)'Image & " walking and order draws="
                   & Image (City_Count (Count_Draws_Week)) & " (1.2.91" & Ref_Draws'Image & ", "
                   & Percent (City_Count (Count_Draws_Week), Ref_Draws) & ") ran in"
                   & Integer'Image (Integer (1000.0 * (Ada.Calendar.Clock - T0))) & " ms");
         Check (City_Get (Table_Gang, G, F_G_Cash) = Cash,
                "orders week" & N'Image & ": cash" & Cash'Image & " (1.2.91 less business income, item 8)");
         Check (Within_20 (City_Count (Count_Draws_Week), Ref_Draws),
                "orders week" & N'Image & ": draws within 20 % of 1.2.91");
      end Week_Run;

      procedure Done_Near (K : Order_Kind; Ref : Integer_32; Label : String) is
         I : constant Integer_32 := Last_Of (K);
         F : constant Integer_32 := City_Get (Table_Last, I, F_O_Finished);
      begin
         Put_Line ("    " & Label & " done at minute" & F'Image & " (1.2.91 with cars" & Ref'Image & ", "
                   & Percent (F, Ref) & ")");
         Check (I >= 0 and then City_Get (Table_Last, I, F_O_State) = Order_State'Pos (Done),
                "orders: " & Label & " done");
      end Done_Near;

      I : Integer_32;
      Pool1, Pool2 : Integer_32;
   begin
      New_Game (1932, 1932, 40, 32);
      G := City_Count (Count_Player_Gang);
      Crew := City_Get (Table_Gang_Crews, G, 1);
      Lt := City_Get (Table_Crews, Crew, F_C_Lieutenant);
      Office := City_Get (Table_Gang, G, F_G_Office);
      Put_Line ("orders: gang" & G'Image & " crew" & City_Get (Table_Crews, Crew, F_C_Id)'Image & " lt " & Name (Lt)
                & " man " & Name (City_Get (Table_Crews, Crew, F_C_Member + 1)) & " office" & Office'Image);
      Check (G = 1 and then City_Get (Table_Gang, G, F_G_Cash) = 6000
             and then City_Get (Table_Crews, Crew, F_C_Id) = 17620 and then Name (Lt) = "Luigi Romano"
             and then Name (City_Get (Table_Crews, Crew, F_C_Member + 1)) = "Sal Rinaldi"
             and then Office = Site (4576) and then City_Get (Table_Building, Office, F_B_Block) = 413,
             "orders: gang 1, cash 6000, crew 17620 of Luigi Romano and Sal Rinaldi, office 4576 in block 413");
      Check (City_Get (Table_Premises, Site (1407), F_Pr_Protect_Gang) = G and then City_Get (Table_Premises, Site (1407), F_Pr_Protect_Weekly) = 152
             and then City_Get (Table_Premises, Site (1578), F_Pr_Protect_Gang) = G and then City_Get (Table_Premises, Site (1578), F_Pr_Protect_Weekly) = 152,
             "orders: sites 1407 and 1578 pay $152 protection");

      --  Week 1
      Order_Begin (Crew, Kind_Of (O_Collect), 1);
      Order_Add (Add_Building, Site (1407), 0);
      Order_Add (Add_Building, Site (1578), 0);
      Issue_It (O_Collect, 1, "collect 1407 1578", 312);
      I := Slot_Of (O_Collect);
      Check (City_Get (Table_Order, I, F_O_Target) = Site (1578) and then City_Get (Table_Order, I, F_O_Target + 1) = Site (1407),
             "orders: the collect route goes 1578 then 1407 (as 1.2.91)");
      Order_Begin (Crew, Kind_Of (O_Buy), 1);
      Order_Add (Add_Building, Site (1411), 0);
      Check (Order_Preview = 1 and then City_Get (Table_Preview, 0, F_O_Cost) = 160, "orders: empty land 1411 costs $160");
      Issue_It (O_Buy, 1, "buy 1411", 359);
      Order_Begin (Crew, Kind_Of (O_Explore), 1);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Explore, 1, "explore block 413", 340);
      I := Slot_Of (O_Explore);
      Check (City_Get (Table_Order, I, F_O_Targets) = 5 and then City_Get (Table_Order, I, F_O_Target) = Site (1583)
             and then City_Get (Table_Order, I, F_O_Target + 4) = Site (4576), "orders: explore covers 1583 .. 1586 and 4576");
      Order_Begin (Crew, Kind_Of (O_Recruit), 1);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Recruit, 1, "recruit block 413", 0, Y_Nothing_There);
      Order_Begin (Crew, Kind_Of (O_Clear_Streets), 1);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Clear_Streets, 1, "clear streets block 413", 0, Y_Streets);
      Order_Begin (Crew, Kind_Of (O_Explore), 3);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Explore, 3, "explore with 3 men", 0, Y_Only_People);
      Check (Reply_Get (1) = Lt and then Reply_Get (2) = 2, "orders: Luigi Romano has only 2 people");
      Launch_Week;
      Check (City_Get (Table_Order, Slot_Of (O_Collect), F_O_State) = Order_State'Pos (Travelling)
             and then Name (City_Get (Table_Order, Slot_Of (O_Collect), F_O_Person)) = "Sal Rinaldi"
             and then Name (City_Get (Table_Order, Slot_Of (O_Buy), F_O_Person)) = "Luigi Romano"
             and then City_Get (Table_Order, Slot_Of (O_Explore), F_O_State) = Order_State'Pos (Queued),
             "orders week 1: collect to Sal Rinaldi, buy to Luigi Romano, explore queued (as 1.2.91)");
      Week_Run (1, 254_050, 5308);
      Check (City_Get (Table_Gang, G, F_G_Wages) = 836, "orders week 1: wages 836");
      Done_Near (O_Buy, 498, "buy");
      Done_Near (O_Collect, 552, "collect");
      Done_Near (O_Explore, 1321, "explore");
      I := Last_Of (O_Collect);
      Check (City_Get (Table_Last, I, F_O_Results) = 2 and then Result (I, 1, 0) = LK (L_Collected)
             and then Result (I, 1, 1) = Site (1578) and then Result (I, 1, 2) = 152 and then Result (I, 2, 1) = Site (1407),
             "orders week 1: collected $152 from 1578 then 1407");
      I := Last_Of (O_Buy);
      Check (Result (I, 1, 0) = LK (L_Bought) and then Result (I, 1, 1) = Site (1411) and then Result (I, 1, 2) = 160
             and then City_Get (Table_Premises, Site (1411), F_Pr_Owner_Gang) = G, "orders week 1: bought 1411 for $160");
      I := Last_Of (O_Explore);
      Check (City_Get (Table_Last, I, F_O_Results) = 5 and then Result (I, 1, 0) = LK (L_Looked_Over)
             and then Result (I, 1, 2) = G and then Result (I, 2, 2) = 0 and then Result (I, 2, 3) = 0
             and then Result (I, 5, 1) = Site (4576) and then Result (I, 5, 2) = G,
             "orders week 1: looked over five sites (owned by you, paying nobody x3, owned by you)");
      Check (City_Get (Table_Gang, G, F_G_Last_Protection) = 304 and then City_Get (Table_Gang, G, F_G_Last_Purchases) = 160,
             "orders week 1: protection 304, purchases 160");

      --  Week 2
      Order_Begin (Crew, Kind_Of (O_Adjust), 1);
      Order_Add (Add_Building, Site (1407), 0);
      Order_Add (Add_Level, 150, 0);
      Issue_It (O_Adjust, 1, "adjust 1407 to 150 %", 142);
      Order_Begin (Crew, Kind_Of (O_Set_Up), 1);
      Order_Add (Add_Building, Site (1583), 0);
      Order_Add (Add_Business, Hood.Tables.T_Clothing_Bank, 0);
      Issue_It (O_Set_Up, 1, "set up a clothing bank at 1583", 538);
      Check (Command (Cmd_Cancel, Slot_Of (O_Set_Up), 0) = YK (Y_Cancelled), "orders: the set-up is cancelled");
      Order_Begin (Crew, Kind_Of (O_Clean_Up), 1);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Clean_Up, 1, "clean up block 413", 338);
      Order_Begin (Crew, Kind_Of (O_Donate), 1);
      Order_Add (Add_Building, Site (1406), 0);
      Order_Add (Add_Amount, 200, 0);
      Issue_It (O_Donate, 1, "donate $200 to 1406", 186);
      Launch_Week;
      Week_Run (2, 229_972, 4022);
      Done_Near (O_Adjust, 255, "adjust");
      Done_Near (O_Clean_Up, 666, "clean up");
      Done_Near (O_Donate, 681, "donate");
      I := Last_Of (O_Adjust);
      Check (Result (I, 1, 0) = LK (L_Protection_Set) and then Result (I, 1, 2) = 228
             and then City_Get (Table_Premises, Site (1407), F_Pr_Protect_Weekly) = 228, "orders week 2: protection at 1407 set to $228");
      I := Last_Of (O_Clean_Up);
      Check (City_Get (Table_Last, I, F_O_Results) = 5 and then Result (I, 1, 0) = LK (L_Cleaned_Up),
             "orders week 2: cleaned up round five sites");
      I := Last_Of (O_Donate);
      Check (Result (I, 1, 0) = LK (L_Donated) and then Result (I, 1, 1) = Site (1406) and then Result (I, 1, 2) = 200,
             "orders week 2: donated $200 to 1406");
      Check (City_Get (Table_Gang, G, F_G_Last_Purchases) = 450, "orders week 2: purchases 450");

      --  Week 3
      Order_Begin (Crew, Kind_Of (O_Run), 1);
      Order_Add (Add_Building, Site (1583), 0);
      Issue_It (O_Run, 1, "run 1583", 176);
      Order_Begin (Crew, Kind_Of (O_Go_To), 1);
      Order_Add (Add_Point, City_Get (Table_Lot, City_Get (Table_Building, Office, F_B_Lot), F_Lot_X)
                 + City_Get (Table_Lot, City_Get (Table_Building, Office, F_B_Lot), F_Lot_W) / 2,
                 City_Get (Table_Lot, City_Get (Table_Building, Office, F_B_Lot), F_Lot_Y)
                 + City_Get (Table_Lot, City_Get (Table_Building, Office, F_B_Lot), F_Lot_H) / 2);
      Issue_It (O_Go_To, 1, "go to the office", 1200);
      Launch_Week;
      Week_Run (3, 228_697, 3186);
      Done_Near (O_Run, 176, "run");
      I := Last_Of (O_Run);
      Check (Result (I, 1, 0) = LK (L_New_Management) and then Result (I, 1, 1) = Site (1583)
             and then Name (City_Get (Table_Premises, Site (1583), F_Pr_Manager)) = "Sal Rinaldi"
             and then City_Get (Table_Crews, Crew, F_C_Count) = 1
             and then Name (City_Get (Table_Crews, Crew, F_C_Member + 1)) = "Gino Costa",
             "orders week 3: Sal Rinaldi runs 1583, Gino Costa joins the crew");
      I := Last_Of (O_Go_To);
      Put_Line ("    go to: held position" & Result (I, 1, 2)'Image & " min (1.2.91 2376)");
      Check (Result (I, 1, 0) = LK (L_Held) and then Within_20 (Result (I, 1, 2), 2376),
             "orders week 3: held position within 20 % of 39h 36m");

      --  Week 4
      Pool1 := City_Get (Table_Pool, G, 1);
      Pool2 := City_Get (Table_Pool, G, 2);
      Check (Command (Cmd_Move_To_Crew, Pool1, Crew) = YK (Y_Joined) and then Name (Pool1) = "Vito Ferrante"
             and then Command (Cmd_Move_To_Crew, Pool2, Crew) = YK (Y_Joined) and then Name (Pool2) = "Carmela Romano",
             "orders: Vito Ferrante and Carmela Romano joined Luigi's Crew");
      Order_Begin (Crew, Kind_Of (O_Patrol), 1);
      Order_Add (Add_Block, 413, 0);
      Issue_It (O_Patrol, 1, "patrol block 413", 600);
      Order_Begin (Crew, Kind_Of (O_Guard), 1);
      Order_Add (Add_Building, Site (1583), 0);
      Issue_It (O_Guard, 1, "guard 1583", 600);
      Order_Begin (Crew, Kind_Of (O_Recruit), 1);
      Order_Add (Add_Block, 411, 0);
      Issue_It (O_Recruit, 1, "recruit block 411", 213);
      Check (City_Get (Table_Order, Slot_Of (O_Recruit), F_O_Target) = Site (1570), "orders: recruit goes to the gym 1570");
      Put_Line ("  orders hash with the week 4 orders given: " & Image (Population_Hash (5)));
      Launch_Week;
      Check (Name (City_Get (Table_Order, Slot_Of (O_Patrol), F_O_Person)) = "Luigi Romano"
             and then Name (City_Get (Table_Order, Slot_Of (O_Guard), F_O_Person)) = "Gino Costa"
             and then Name (City_Get (Table_Order, Slot_Of (O_Recruit), F_O_Person)) = "Vito Ferrante",
             "orders week 4: patrol to Luigi Romano, guard to Gino Costa, recruit to Vito Ferrante (as 1.2.91)");
      Week_Run (4, 231_961, 2266);
      Done_Near (O_Recruit, 294, "recruit");
      I := Last_Of (O_Patrol);
      Put_Line ("    patrol: " & Result (I, 1, 2)'Image & " block(s) for" & Result (I, 1, 3)'Image & " min (1.2.91 1, 2344)");
      Check (Result (I, 1, 0) = LK (L_Patrolled) and then Result (I, 1, 2) = 1 and then Within_20 (Result (I, 1, 3), 2344),
             "orders week 4: patrolled 1 block, within 20 % of 39h 4m");
      I := Last_Of (O_Guard);
      Put_Line ("    guard:" & Result (I, 1, 2)'Image & " min (1.2.91 2399)");
      Check (Result (I, 1, 0) = LK (L_Stood_Guard) and then Result (I, 1, 1) = Site (1583) and then Within_20 (Result (I, 1, 2), 2399),
             "orders week 4: stood guard at 1583, within 20 % of 39h 59m");
      I := Last_Of (O_Recruit);
      Check (Result (I, 1, 0) = LK (L_Signed_On) and then Result (I, 1, 2) = 1
             and then City_Get (Table_Gang, G, F_G_Pool_Count) = 2 and then City_Get (Table_Crews, Crew, F_C_Count) = 3,
             "orders week 4: 1 hood signed on to the pool; pool 2, crew 3");
      Check (City_Get (Table_Gang, G, F_G_Wages) = 920, "orders week 4: wages 920");
      --  Commands
      Check (Command (Cmd_Promote, Lt, 0) = YK (Y_Choose_Hood), "orders: a lieutenant cannot be promoted");
      Check (Command (Cmd_Promote, Pool1, 0) = YK (Y_Promoted) and then City_Get (Table_Gang, G, F_G_Crew_Total) = 2
             and then City_Get (Table_Person, Pool1, F_P_Role) = Hood.Tables.Role'Pos (Hood.Tables.R_Lieutenant),
             "orders: Vito Ferrante now runs his own crew");
      Check (Command (Cmd_Move_To_Crew, Pool2, City_Get (Table_Gang_Crews, G, 2)) = YK (Y_Joined)
             and then Command (Cmd_Move_To_Crew, Pool2, City_Get (Table_Gang_Crews, G, 2)) = YK (Y_Already_In),
             "orders: Carmela Romano moves to the new crew, then is already in it");
      Check (Command (Cmd_Demote, City_Get (Table_Gang_Crews, G, 2), 0) = YK (Y_Broken_Up)
             and then City_Get (Table_Gang, G, F_G_Crew_Total) = 1
             and then City_Get (Table_Person, Pool1, F_P_Role) = Hood.Tables.Role'Pos (Hood.Tables.R_Hood),
             "orders: the crew has been broken up; Vito Ferrante is a hood again");
      Check (Command (Cmd_Move_To_Pool, Lt, 0) = YK (Y_Choose_Crew_Hood)
             and then Command (Cmd_Move_To_Pool, Pool2, 0) = YK (Y_Done), "orders: move to the pool");
      declare
         Before : constant Integer_32 := City_Get (Table_Person, Pool2, F_P_Loyalty);
      begin
         Check (Command (Cmd_Set_Pay, Pool2, City_Get (Table_Person, Pool2, F_P_Pay) - 10) = YK (Y_Done)
                and then City_Get (Table_Person, Pool2, F_P_Loyalty) = Integer_32'Max (0, Before - 6 * 255),
                "orders: a pay cut costs 6 % loyalty");
      end;
      Check (Command (Cmd_Sack, Pool2, 0) = YK (Y_Back_On_Street) and then City_Get (Table_Person, Pool2, F_P_Gang) = 0,
             "orders: Carmela Romano is back on the street");
      Check (Command (Cmd_Cancel, -5, 0) = YK (Y_No_Order), "orders: no such order");
      New_Game (1932, 1932, 44, 35);
   end Order_Checks;

   procedure World_Checks is
      type World_Ref is access Hood.World.World_State;
      Small : constant World_Ref := new Hood.World.World_State;  --  8 MB: on the heap, not the stack
      First : Unsigned_32;
   begin
      Check (State_Hash = 0 and then Grid_W = 0 and then Cell_Kind (0, 0) = -1,
             "before hs_new_game: hash 0, empty grid");
      New_Game (1932, 1932, 44, 35);
      First := State_Hash;
      Put ("world hash seed 1932/1932 Large:  " & Image (First) & "  ");
      Hex_IO.Put (First, Base => 16);
      New_Line;
      New_Game (1932, 1932, 44, 35);
      Check (State_Hash = First, "the same world gives the same hash");
      New_Game (1933, 1932, 44, 35);
      Check (State_Hash /= First, "another seed gives another hash");
      New_Game (1932, 1932, 99, 1);
      Check (Grid_W = 220 and then Grid_H = 40, "sizes are clamped to 8 .. 44 by 8 .. 35");
      Hood.World.New_Game (Small.all, 1932, 1932, 8, 8);
      Check (Hood.World.Hash (Small.all) /= First, "a small world hashes differently");
      New_Game (16#80AB_CD71#, 1932, 44, 35);
      Check (Rng_Value (Stream_Main, 1) /= 0, "a seed above 2**31 is accepted");
      New_Game (1932, 1932, 44, 35);
   end World_Checks;

begin
   Put_Line ("stamp          " & Hood.Version.Stamp);
   Put_Line ("hs_build_id    " & Image (Build_Id));
   Check (Build_Id = Hood.Version.Build_Id, "hs_build_id matches the stamp");
   World_Checks;
   City_Checks;
   People_Checks;
   Order_Checks;
   Random_Checks;
   Number_Checks;
   Trig_Checks;
   Grid_Checks;
   Check (Error_File_Length = 0, "hs_error_file_length is 0 before a stop");
   Check (Error_File_Char (1) = 0, "hs_error_file_char is 0 outside the name");
   begin
      Crash_Test (Error_Crash_Test);
   exception
      when E : Program_Error =>
         Put_Line ("hs_crash_test (4) stopped at "
                   & Ada.Exceptions.Exception_Message (E));
   end;
   Check (Pending_Code = Error_Crash_Test, "hs_crash_test sets code 4");
   Set_Error_File ("hood-host_abi.adb");
   Check (File_Name = "hood-host_abi.adb",
          "hs_error_file_length/hs_error_file_char return the file name");

   if Failures = 0 then
      Put_Line ("smoke passed");
   else
      Put_Line ("smoke FAILED:" & Natural'Image (Failures));
      Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Failure);
   end if;
end Smoke;
